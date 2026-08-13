import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CalendarSyncService } from '../integrations/calendar-sync.service'
import type {
  ActivityDto, ActivityStatus, ActivityType, AttendeeDto, AttendeeResponse,
  CreateActivityDto, RecurrencePatternDto, UpdateActivityDto,
} from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

const TYPES: ActivityType[] = ['meeting', 'call', 'visit', 'demo', 'task', 'follow_up', 'email']
const STATUSES: ActivityStatus[] = ['scheduled', 'completed', 'cancelled']
// Only types that represent a real time-boxed engagement get mirrored to Outlook.
const PUSH_TYPES = new Set<ActivityType>(['meeting', 'call', 'visit', 'demo'])

/** Minimal shape needed to build an ActivityDto. Kept private to this file. */
type ActivityRow = {
  id: string; type: string; title: string; description: string | null
  scheduledAt: Date; durationMin: number | null; status: string; notes: string | null
  location: string | null; meetingLink: string | null
  attendees: unknown  // Prisma Json — parsed via CalendarSyncService.parseAttendees
  externalCalendarId: string | null
  calendarSyncedAt: Date | null
  recurrence: unknown  // Prisma Json — parsed via parseRecurrence
  ownerId: string; customerId: string | null; opportunityId: string | null
  createdAt: Date
  owner: { name: string }
  customer: { name: string } | null
  opportunity: { title: string; serviceOrProduct: string | null } | null
}

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name)
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private calendar: CalendarSyncService,
  ) {}

  async list(filter: { from?: Date; to?: Date; ownerId?: string; customerId?: string; opportunityId?: string } = {}): Promise<ActivityDto[]> {
    const rows = await this.prisma.activity.findMany({
      where: {
        ownerId: filter.ownerId,
        customerId: filter.customerId,
        opportunityId: filter.opportunityId,
        scheduledAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
      },
      include: { owner: true, customer: true, opportunity: { select: { title: true, serviceOrProduct: true } } },
      orderBy: { scheduledAt: 'asc' },
    })
    return this.toDtos(rows)
  }

  async findOne(id: string): Promise<ActivityDto> {
    const row = await this.prisma.activity.findUnique({
      where: { id }, include: { owner: true, customer: true, opportunity: true },
    })
    if (!row) throw new NotFoundException(`Activity ${id} not found`)
    return (await this.toDtos([row]))[0]
  }

  async create(input: CreateActivityDto, ctx: AuditRequestContext): Promise<ActivityDto> {
    if (!TYPES.includes(input.type)) throw new BadRequestException(`Invalid activity type ${input.type}`)
    if (input.status && !STATUSES.includes(input.status)) throw new BadRequestException(`Invalid status ${input.status}`)

    const row = await this.prisma.activity.create({
      data: {
        type: input.type, title: input.title, description: input.description ?? null,
        scheduledAt: new Date(input.scheduledAt),
        durationMin: input.durationMin ?? null, ownerId: input.ownerId,
        customerId: input.customerId ?? null, opportunityId: input.opportunityId ?? null,
        status: input.status ?? 'scheduled', notes: input.notes ?? null,
        location: input.location ?? null, meetingLink: input.meetingLink ?? null,
        attendees: this.normaliseAttendeesForStorage(input.attendees),
        recurrence: this.normaliseRecurrenceForStorage(input.recurrence),
      },
      include: { owner: true, customer: true, opportunity: { select: { title: true, serviceOrProduct: true } } },
    })
    await this.audit.log({ ...ctx, action: 'activity.create', entity: 'activity', entityId: row.id, after: row })
    if (PUSH_TYPES.has(row.type as ActivityType) && row.status === 'scheduled') {
      await this.safePush(() => this.calendar.pushCreate(row.id, row.ownerId), 'create', row.id)
      const refreshed = await this.prisma.activity.findUnique({
        where: { id: row.id },
        include: { owner: true, customer: true, opportunity: { select: { title: true, serviceOrProduct: true } } },
      })
      if (refreshed) return (await this.toDtos([refreshed]))[0]
    }
    return (await this.toDtos([row]))[0]
  }

  async update(id: string, input: UpdateActivityDto, ctx: AuditRequestContext): Promise<ActivityDto> {
    const before = await this.prisma.activity.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Activity ${id} not found`)
    if (input.type && !TYPES.includes(input.type)) throw new BadRequestException(`Invalid activity type ${input.type}`)
    if (input.status && !STATUSES.includes(input.status)) throw new BadRequestException(`Invalid status ${input.status}`)

    const data: Record<string, unknown> = { ...input }
    if (input.scheduledAt !== undefined) data.scheduledAt = new Date(input.scheduledAt)
    if (input.attendees !== undefined) data.attendees = this.normaliseAttendeesForStorage(input.attendees)
    if (input.recurrence !== undefined) data.recurrence = this.normaliseRecurrenceForStorage(input.recurrence)

    const row = await this.prisma.activity.update({
      where: { id }, data,
      include: { owner: true, customer: true, opportunity: { select: { title: true, serviceOrProduct: true } } },
    })
    await this.audit.log({ ...ctx, action: 'activity.update', entity: 'activity', entityId: id, before, after: row })
    if (row.externalCalendarId) {
      await this.safePush(() => this.calendar.pushUpdate(row.id), 'update', row.id)
    } else if (PUSH_TYPES.has(row.type as ActivityType) && row.status === 'scheduled') {
      // Newly qualifies for calendar sync after this edit (e.g. status flipped or type changed).
      await this.safePush(() => this.calendar.pushCreate(row.id, row.ownerId), 'create-on-update', row.id)
    }
    return (await this.toDtos([row]))[0]
  }

  /**
   * Force a fresh outbound push to Outlook without changing anything in the CRM.
   * Handy when Outlook state has drifted (someone edited on the Outlook side and got
   * out of sync) or a previous push errored silently. Only works if the activity is
   * already linked (has externalCalendarId).
   */
  async forceResync(id: string, ctx: AuditRequestContext): Promise<ActivityDto> {
    const existing = await this.prisma.activity.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`Activity ${id} not found`)
    if (!existing.externalCalendarId) throw new BadRequestException('Activity is not linked to a calendar')
    await this.audit.log({ ...ctx, action: 'activity.calendar.force_resync', entity: 'activity', entityId: id })
    await this.safePush(() => this.calendar.pushUpdate(id), 'force-resync', id)
    return this.findOne(id)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const before = await this.prisma.activity.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Activity ${id} not found`)
    await this.prisma.activity.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'activity.delete', entity: 'activity', entityId: id, before })
    if (before.externalCalendarId) {
      await this.safePush(() => this.calendar.pushDelete(before), 'delete', id)
    }
  }

  /** Calendar push failures must never fail the CRM write — we log and move on. */
  private async safePush(fn: () => Promise<void>, kind: string, activityId: string): Promise<void> {
    try { await fn() }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Calendar push (${kind}) for activity ${activityId} failed: ${msg}`)
    }
  }

  /** Client accepts either `["a@b.com"]` (bare emails) or `[{email, name?, response?}]`. Both normalise to the object form stored as JSON. */
  private normaliseAttendeesForStorage(input: unknown): Prisma.InputJsonValue {
    return this.calendar.parseAttendees(input) as unknown as Prisma.InputJsonValue
  }

  /**
   * Accept the RecurrencePatternDto shape, discard unknown fields, and validate the
   * enum values so a garbage payload can't break outbound push. Returning null when
   * cleared lets `Prisma.NullableJsonNullValueInput` set the column to database NULL.
   */
  private normaliseRecurrenceForStorage(input: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    if (input === null || input === undefined) return Prisma.JsonNull
    if (typeof input !== 'object') return Prisma.JsonNull
    const r = input as { type?: string; interval?: number; daysOfWeek?: unknown; endDate?: unknown }
    if (r.type !== 'daily' && r.type !== 'weekly' && r.type !== 'monthly') return Prisma.JsonNull
    if (typeof r.endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.endDate)) return Prisma.JsonNull
    const interval = Math.max(1, Math.floor(Number(r.interval) || 1))
    const DAYS: RecurrencePatternDto['daysOfWeek'] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    const daysOfWeek = Array.isArray(r.daysOfWeek)
      ? (r.daysOfWeek as unknown[]).filter((d): d is NonNullable<RecurrencePatternDto['daysOfWeek']>[number] => typeof d === 'string' && (DAYS as readonly string[]).includes(d))
      : []
    const cleaned: RecurrencePatternDto = {
      type: r.type,
      interval,
      endDate: r.endDate,
      ...(daysOfWeek.length > 0 ? { daysOfWeek } : {}),
    }
    return cleaned as unknown as Prisma.InputJsonValue
  }

  /**
   * Batch-enriches every attendee across the given activity rows with matching CRM
   * Contact info (id + name). One SQL round-trip regardless of how many activities
   * or attendees are in play. Manual contactId (stored on the attendee) beats
   * email-based auto-match — that's how the "Link to Contact" UI overrides.
   */
  private async toDtos(rows: ActivityRow[]): Promise<ActivityDto[]> {
    // Collect all attendee emails AND manually-linked contactIds so we can look them
    // both up in a single query.
    const parsedByRow = new Map<string, Array<{ email: string; name: string | null; response: string | null; contactId: string | null }>>()
    const allEmails = new Set<string>()
    const allContactIds = new Set<string>()
    for (const r of rows) {
      const list = this.calendar.parseAttendees(r.attendees)
      parsedByRow.set(r.id, list)
      for (const a of list) {
        allEmails.add(a.email)
        if (a.contactId) allContactIds.add(a.contactId)
      }
    }
    const contactByEmail = new Map<string, { id: string; name: string }>()
    const contactById = new Map<string, { id: string; name: string }>()
    if (allEmails.size > 0 || allContactIds.size > 0) {
      const contacts = await this.prisma.contact.findMany({
        where: {
          OR: [
            ...(allEmails.size > 0 ? [{ email: { in: [...allEmails], mode: 'insensitive' as const } }] : []),
            ...(allContactIds.size > 0 ? [{ id: { in: [...allContactIds] } }] : []),
          ],
        },
        select: { id: true, name: true, email: true },
      })
      for (const c of contacts) {
        const key = c.email.toLowerCase()
        if (!contactByEmail.has(key)) contactByEmail.set(key, { id: c.id, name: c.name })
        contactById.set(c.id, { id: c.id, name: c.name })
      }
    }
    return rows.map((r) => this.rowToDto(r, parsedByRow.get(r.id) ?? [], contactByEmail, contactById))
  }

  private rowToDto(
    row: ActivityRow,
    attendees: Array<{ email: string; name: string | null; response: string | null; contactId: string | null }>,
    contactByEmail: Map<string, { id: string; name: string }>,
    contactById: Map<string, { id: string; name: string }>,
  ): ActivityDto {
    const enriched: AttendeeDto[] = attendees.map((a) => {
      // Manual link wins; otherwise fall back to email-based auto-match.
      const manual = a.contactId ? contactById.get(a.contactId) : undefined
      const match = manual ?? contactByEmail.get(a.email) ?? null
      return {
        email: a.email,
        name: a.name,
        response: (a.response as AttendeeResponse | null) ?? null,
        contactId: match?.id ?? null,
        contactName: match?.name ?? null,
      }
    })
    return {
      id: row.id, type: row.type as ActivityType, title: row.title, description: row.description,
      scheduledAt: row.scheduledAt.toISOString(), durationMin: row.durationMin,
      ownerId: row.ownerId, ownerName: row.owner.name,
      customerId: row.customerId, customerName: row.customer?.name ?? null,
      opportunityId: row.opportunityId, opportunityTitle: row.opportunity?.title ?? null,
      opportunityServiceOrProduct: row.opportunity?.serviceOrProduct ?? null,
      status: row.status as ActivityStatus,
      location: row.location, meetingLink: row.meetingLink,
      notes: row.notes,
      attendees: enriched,
      linkedToCalendar: Boolean(row.externalCalendarId),
      calendarSyncedAt: row.calendarSyncedAt?.toISOString() ?? null,
      recurrence: this.parseRecurrenceForDto(row.recurrence),
      createdAt: row.createdAt.toISOString(),
    }
  }

  private parseRecurrenceForDto(raw: unknown): RecurrencePatternDto | null {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as RecurrencePatternDto
    if (r.type !== 'daily' && r.type !== 'weekly' && r.type !== 'monthly') return null
    if (typeof r.endDate !== 'string') return null
    return r
  }
}
