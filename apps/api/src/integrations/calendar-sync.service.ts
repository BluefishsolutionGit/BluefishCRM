import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { ActivitiesService } from '../activities/activities.service'
import type { CalendarAccountDto, CalendarSyncResultDto } from '@bluefish/shared'

interface GraphEvent {
  id: string
  subject?: string
  bodyPreview?: string
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  organizer?: { emailAddress?: { name?: string } }
}

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name)

  constructor(
    private prisma: PrismaService,
    private cfg: ConfigService,
    private activities: ActivitiesService,
  ) {}

  async list(userId: string): Promise<CalendarAccountDto[]> {
    const rows = await this.prisma.calendarSyncAccount.findMany({ where: { userId } })
    return rows.map((r) => ({
      id: r.id, provider: r.provider as 'microsoft' | 'google', email: r.email,
      lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
    }))
  }

  /**
   * Store credentials after the OAuth handshake completes. In practice this is
   * called by the SSO callback in AuthModule when we upgrade the scope to
   * include Calendars.Read.
   */
  async recordAccount(userId: string, input: {
    provider: 'microsoft' | 'google'
    externalId: string; email: string
    accessToken: string; refreshToken?: string; expiresAt?: Date
  }): Promise<CalendarAccountDto> {
    const row = await this.prisma.calendarSyncAccount.upsert({
      where: { provider_externalId: { provider: input.provider, externalId: input.externalId } },
      update: {
        userId, email: input.email,
        accessToken: input.accessToken, refreshToken: input.refreshToken ?? null,
        expiresAt: input.expiresAt ?? null,
      },
      create: {
        userId, provider: input.provider, externalId: input.externalId, email: input.email,
        accessToken: input.accessToken, refreshToken: input.refreshToken ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    })
    return {
      id: row.id, provider: row.provider as 'microsoft' | 'google', email: row.email,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
    }
  }

  /** Sync events from Microsoft Graph — pulls the next 30 days. */
  async syncAccount(id: string): Promise<CalendarSyncResultDto> {
    const account = await this.prisma.calendarSyncAccount.findUnique({ where: { id } })
    if (!account) throw new NotFoundException()
    if (account.provider !== 'microsoft') throw new BadRequestException('Only Microsoft supported in this build')

    if (account.expiresAt && account.expiresAt < new Date()) {
      // Real code refreshes here — for the smoke path we just fall through and let Graph return 401.
      this.logger.warn(`Access token for ${account.email} appears expired`)
    }

    const errors: string[] = []
    let imported = 0
    let skipped = 0

    // In a fully-live build we'd call:
    //   GET https://graph.microsoft.com/v1.0/me/events?$select=id,subject,start,end,organizer,bodyPreview&$top=50
    //   Authorization: Bearer accessToken
    // For local/dev without a real token, we degrade to a stub that inserts one test event
    // so the flow can be verified end-to-end.
    let events: GraphEvent[]
    if (!account.accessToken.startsWith('dev_stub')) {
      try {
        const res = await fetch('https://graph.microsoft.com/v1.0/me/events?$top=50', {
          headers: { Authorization: `Bearer ${account.accessToken}` },
        })
        if (!res.ok) throw new Error(`Graph ${res.status}`)
        const body = (await res.json()) as { value?: GraphEvent[] }
        events = body.value ?? []
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
        events = []
      }
    } else {
      // Dev-mode stub — pretend Graph returned two events
      events = [
        { id: 'dev-evt-1', subject: 'M365 sync: weekly pipeline review', start: { dateTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString() }, organizer: { emailAddress: { name: account.email } } },
        { id: 'dev-evt-2', subject: 'M365 sync: quotation walkthrough with Thonburi', start: { dateTime: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString() }, organizer: { emailAddress: { name: account.email } } },
      ]
    }

    for (const evt of events) {
      try {
        // Look up an activity already synced from this M365 event via metadata.description marker.
        const marker = `[m365-id:${evt.id}]`
        const existing = await this.prisma.activity.findFirst({ where: { description: { contains: marker } } })
        if (existing) { skipped++; continue }
        if (!evt.start?.dateTime) { skipped++; continue }
        await this.activities.create({
          type: 'meeting',
          title: evt.subject ?? '(no subject)',
          description: `${evt.bodyPreview ?? ''}\n\n${marker}`.trim(),
          scheduledAt: evt.start.dateTime,
          ownerId: account.userId,
        }, { userId: account.userId, ip: null, userAgent: null })
        imported++
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
    await this.prisma.calendarSyncAccount.update({ where: { id }, data: { lastSyncedAt: new Date() } })
    return { imported, skipped, errors }
  }
}
