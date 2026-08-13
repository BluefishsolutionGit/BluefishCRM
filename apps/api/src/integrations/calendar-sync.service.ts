import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { CalendarAccountDto, CalendarSyncResultDto } from '@bluefish/shared'

interface GraphEvent {
  id: string
  subject?: string
  bodyPreview?: string
  isCancelled?: boolean
  isAllDay?: boolean
  type?: 'singleInstance' | 'seriesMaster' | 'occurrence' | 'exception'
  seriesMasterId?: string
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  location?: { displayName?: string }
  organizer?: { emailAddress?: { name?: string; address?: string } }
  onlineMeeting?: { joinUrl?: string }
  attendees?: Array<{ emailAddress?: { address?: string; name?: string }; type?: string; status?: { response?: string } }>
  '@removed'?: { reason?: string }
}

interface DeltaPage {
  value?: GraphEvent[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
  error?: string
  error_description?: string
}

const CALENDAR_SCOPES = 'openid offline_access profile email User.Read Calendars.ReadWrite'

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name)
  /** state → { userId, expiresAt } — short-lived, in-memory OAuth handshake tokens. */
  private readonly pendingConnects = new Map<string, { userId: string; expiresAt: number }>()

  constructor(
    private prisma: PrismaService,
    private cfg: ConfigService,
    private audit: AuditService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.cfg.get<string>('MICROSOFT_CLIENT_ID') &&
        this.cfg.get<string>('MICROSOFT_CLIENT_SECRET') &&
        this.cfg.get<string>('MICROSOFT_TENANT_ID'),
    )
  }

  private redirectUri(): string {
    // A dedicated callback for calendar OAuth so scopes/tokens stay separate from login SSO.
    return this.cfg.get<string>('MICROSOFT_CALENDAR_REDIRECT_URI')
      ?? 'http://localhost:4000/api/integrations/calendar/microsoft/callback'
  }

  authorizeUrl(userId: string): string {
    if (!this.isConfigured()) throw new BadRequestException('Microsoft OAuth is not configured on this server')
    const clientId = this.cfg.get<string>('MICROSOFT_CLIENT_ID')!
    const tenant = this.cfg.get<string>('MICROSOFT_TENANT_ID')!
    const state = this.createConnectState(userId)
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri(),
      response_mode: 'query',
      scope: CALENDAR_SCOPES,
      state,
      prompt: 'consent',
    })
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`
  }

  private createConnectState(userId: string): string {
    this.gcPendingConnects()
    const state = crypto.randomBytes(24).toString('base64url')
    this.pendingConnects.set(state, { userId, expiresAt: Date.now() + 10 * 60 * 1000 })
    return state
  }

  private consumeConnectState(state: string): string | null {
    const entry = this.pendingConnects.get(state)
    if (!entry) return null
    this.pendingConnects.delete(state)
    if (entry.expiresAt < Date.now()) return null
    return entry.userId
  }

  private gcPendingConnects() {
    const now = Date.now()
    for (const [k, v] of this.pendingConnects) if (v.expiresAt < now) this.pendingConnects.delete(k)
  }

  /**
   * Called from GET /callback — exchanges the auth code for tokens, decodes the id_token
   * to get identity, and upserts a CalendarSyncAccount linked to the user we stashed
   * during /connect.
   */
  async handleCallback(code: string, state: string): Promise<CalendarAccountDto> {
    const userId = this.consumeConnectState(state)
    if (!userId) throw new UnauthorizedException('OAuth state expired or unknown')
    if (!this.isConfigured()) throw new BadRequestException('Microsoft OAuth is not configured')

    const tokens = await this.exchangeCode(code)
    if (!tokens.access_token) throw new UnauthorizedException('No access_token from Microsoft')

    const idInfo = tokens.id_token ? this.decodeIdToken(tokens.id_token) : {}
    const email = (idInfo.email ?? idInfo.preferred_username ?? idInfo.upn ?? '') as string
    const oid = (idInfo.oid ?? '') as string
    if (!email || !oid) throw new UnauthorizedException('Missing profile fields from Microsoft')

    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined
    const account = await this.recordAccount(userId, {
      provider: 'microsoft',
      externalId: oid,
      email: email.toLowerCase(),
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    })
    // Fire-and-forget: subscription creation shouldn't block the OAuth redirect. If it
    // fails or no public URL is configured, the polling cron still keeps sync fresh.
    void this.ensureWebhookSubscription(account.id).catch((err) =>
      this.logger.warn(`Webhook subscription (create) failed for ${account.email}: ${err instanceof Error ? err.message : err}`),
    )
    return account
  }

  private async exchangeCode(code: string): Promise<TokenResponse> {
    const tenant = this.cfg.get<string>('MICROSOFT_TENANT_ID')!
    const body = new URLSearchParams({
      client_id: this.cfg.get<string>('MICROSOFT_CLIENT_ID')!,
      client_secret: this.cfg.get<string>('MICROSOFT_CLIENT_SECRET')!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri(),
      scope: CALENDAR_SCOPES,
    })
    const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    })
    const json = (await res.json()) as TokenResponse
    if (!res.ok) {
      this.logger.error(`Token exchange failed: ${json.error} — ${json.error_description}`)
      throw new UnauthorizedException(json.error_description ?? 'Microsoft token exchange failed')
    }
    return json
  }

  private async refreshTokens(refreshToken: string): Promise<TokenResponse> {
    const tenant = this.cfg.get<string>('MICROSOFT_TENANT_ID')!
    const body = new URLSearchParams({
      client_id: this.cfg.get<string>('MICROSOFT_CLIENT_ID')!,
      client_secret: this.cfg.get<string>('MICROSOFT_CLIENT_SECRET')!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: CALENDAR_SCOPES,
    })
    const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    })
    const json = (await res.json()) as TokenResponse
    if (!res.ok) {
      this.logger.error(`Token refresh failed: ${json.error} — ${json.error_description}`)
      throw new UnauthorizedException('Refresh token rejected — reconnect Microsoft account')
    }
    return json
  }

  private decodeIdToken(jwt: string): Record<string, unknown> {
    const parts = jwt.split('.')
    if (parts.length !== 3) return {}
    try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown> }
    catch { return {} }
  }

  async list(userId: string): Promise<CalendarAccountDto[]> {
    const rows = await this.prisma.calendarSyncAccount.findMany({ where: { userId } })
    return rows.map((r) => ({
      id: r.id, provider: r.provider as 'microsoft' | 'google', email: r.email,
      lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
    }))
  }

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

  async disconnect(userId: string, id: string): Promise<void> {
    const account = await this.prisma.calendarSyncAccount.findUnique({ where: { id } })
    if (!account) throw new NotFoundException()
    if (account.userId !== userId) throw new UnauthorizedException()
    // Delete the Graph subscription first so Microsoft stops sending notifications for
    // a user we no longer track. Failure here (revoked consent, network) is non-fatal.
    await this.deleteWebhookSubscription(account)
    await this.prisma.calendarSyncAccount.delete({ where: { id } })
  }

  /**
   * Incremental sync using Microsoft Graph delta queries. First call for a fresh account
   * pulls the last 7 → next 60 days; every subsequent call resumes from the persisted
   * @odata.deltaLink and receives only added/modified/removed events. Deleted events
   * (@removed) trigger deletion of the mirrored activity. All mutations bypass
   * ActivitiesService to avoid triggering an outbound push (which would either duplicate
   * back to Outlook or DELETE an event we already know Outlook removed).
   */
  async syncAccount(userId: string, id: string): Promise<CalendarSyncResultDto> {
    const account = await this.prisma.calendarSyncAccount.findUnique({ where: { id } })
    if (!account) throw new NotFoundException()
    if (account.userId !== userId) throw new UnauthorizedException()
    return this.runSync(account)
  }

  /** Same as syncAccount but skips ownership check — used by the polling cron. */
  async runSyncForAccountId(id: string): Promise<CalendarSyncResultDto> {
    const account = await this.prisma.calendarSyncAccount.findUnique({ where: { id } })
    if (!account) throw new NotFoundException()
    return this.runSync(account)
  }

  private async runSync(account: {
    id: string; userId: string; provider: string; email: string
    accessToken: string; refreshToken: string | null; expiresAt: Date | null
    deltaLink: string | null
  }): Promise<CalendarSyncResultDto> {
    if (account.provider !== 'microsoft') throw new BadRequestException('Only Microsoft supported in this build')

    // Refresh proactively if we know it's expired.
    if (account.expiresAt && account.expiresAt < new Date() && account.refreshToken) {
      await this.refreshAndPersist(account.id, account.refreshToken)
    }

    const errors: string[] = []
    let imported = 0
    let updated = 0
    let removed = 0
    let skipped = 0
    let nextDeltaLink: string | null = account.deltaLink

    try {
      const pages = account.accessToken.startsWith('dev_stub')
        ? this.devStubDeltaPages(account.id, account.email, account.deltaLink)
        : await this.fetchGraphDeltaPages(account)

      for (const page of pages) {
        for (const evt of page.value ?? []) {
          try {
            const outcome = await this.applyDeltaEvent(account.id, account.userId, evt)
            if (outcome === 'imported') imported++
            else if (outcome === 'updated') updated++
            else if (outcome === 'removed') removed++
            else skipped++
          } catch (err) {
            errors.push(err instanceof Error ? err.message : String(err))
          }
        }
        if (page['@odata.deltaLink']) nextDeltaLink = page['@odata.deltaLink']
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }

    await this.prisma.calendarSyncAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), deltaLink: nextDeltaLink ?? undefined },
    })
    // Existing DTO surfaces {imported, skipped, errors}; roll updates + removals into skipped
    // rather than break the shape. The full breakdown is logged for operators.
    if (updated || removed) {
      this.logger.log(`Sync ${account.id}: +${imported} ~${updated} -${removed} (skipped ${skipped}, errors ${errors.length})`)
    }
    return { imported, skipped: skipped + updated + removed, errors }
  }

  private async applyDeltaEvent(accountId: string, userId: string, evt: GraphEvent): Promise<'imported' | 'updated' | 'removed' | 'skipped'> {
    if (evt['@removed']) {
      // Event deleted upstream — delete the mirrored activity (via prisma to skip the push).
      const existing = await this.prisma.activity.findFirst({ where: { externalCalendarId: evt.id } })
      if (!existing) return 'skipped'
      await this.prisma.activity.delete({ where: { id: existing.id } })
      return 'removed'
    }
    // calendarView expands recurring series into per-occurrence events, so the master is
    // redundant — importing it would double-book the whole series as one long meeting.
    if (evt.type === 'seriesMaster') return 'skipped'
    // Occurrences of a series we OWN would double-book: we already have the CRM activity
    // pointing at the master; each occurrence would create a separate row. Skip if the
    // seriesMasterId matches an activity we already have.
    if (evt.seriesMasterId) {
      const ownedMaster = await this.prisma.activity.findFirst({
        where: { externalCalendarId: evt.seriesMasterId },
        select: { id: true },
      })
      if (ownedMaster) return 'skipped'
    }
    // All-day items on Outlook are usually PTO / OOO / holidays, not sales activities.
    if (evt.isAllDay) return 'skipped'
    if (!evt.start?.dateTime) return 'skipped'

    // Match by externalCalendarId first; the [m365-id:<id>] description marker only exists
    // for activities imported by the pre-delta code path.
    const marker = `[m365-id:${evt.id}]`
    const existing = await this.prisma.activity.findFirst({
      where: { OR: [{ externalCalendarId: evt.id }, { description: { contains: marker } }] },
    })

    // Cancelled but not @removed — Outlook keeps the event, just flags it. Reflect that
    // on the CRM side without discarding the row (preserves audit + linked opportunity).
    if (evt.isCancelled) {
      if (!existing) return 'skipped'
      if (existing.status !== 'cancelled') {
        await this.prisma.activity.update({ where: { id: existing.id }, data: { status: 'cancelled' } })
        return 'updated'
      }
      return 'skipped'
    }

    const duration = this.durationMinutes(evt)
    const attendees = (evt.attendees ?? [])
      .map((a) => {
        const email = a.emailAddress?.address?.toLowerCase()
        if (!email) return null
        return {
          email,
          name: a.emailAddress?.name ?? null,
          response: (a.status?.response ?? null) as string | null,
        }
      })
      .filter((a): a is { email: string; name: string | null; response: string | null } => a !== null)
    const data = {
      title: evt.subject ?? '(no subject)',
      description: evt.bodyPreview ?? null,
      scheduledAt: new Date(evt.start.dateTime),
      durationMin: duration ?? null,
      location: evt.location?.displayName ?? null,
      meetingLink: evt.onlineMeeting?.joinUrl ?? null,
      attendees,
    }
    if (existing) {
      // Detect RSVP changes BEFORE persisting so we can compare old vs new. Only fires
      // for attendees whose response actually transitioned — first-time imports don't
      // trigger notifications (nothing to compare against).
      this.emitRsvpChangeAudits(existing, attendees)

      // Patch the activity in place. Keep externalCalendarId + accountId (they're already set,
      // or need to be set for legacy marker-only rows). Restore status if event was
      // un-cancelled upstream.
      await this.prisma.activity.update({
        where: { id: existing.id },
        data: {
          ...data,
          externalCalendarId: evt.id,
          externalCalendarAccountId: accountId,
          calendarSyncedAt: new Date(),
          ...(existing.status === 'cancelled' ? { status: 'scheduled' } : {}),
        },
      })
      return 'updated'
    }
    await this.prisma.activity.create({
      data: {
        ...data,
        type: 'meeting',
        ownerId: userId,
        externalCalendarId: evt.id,
        externalCalendarAccountId: accountId,
        calendarSyncedAt: new Date(),
      },
    })
    return 'imported'
  }

  /**
   * Fire an audit event when an attendee's response meaningfully changes. Which
   * transitions matter (and their audit action key):
   *   → declined            = activity.attendee.declined   (bad — someone dropped out)
   *   → tentativelyAccepted = activity.attendee.tentative  (warn — soft commit)
   * Ignored: accepted (positive but noisy), notResponded (usually the initial state),
   * and any transition where the previous value already matches (guards against
   * duplicate notifications on steady-state syncs).
   */
  private emitRsvpChangeAudits(
    existing: { id: string; ownerId: string; title: string; attendees: unknown },
    incoming: Array<{ email: string; name: string | null; response: string | null }>,
  ): void {
    const prev = new Map(this.parseAttendees(existing.attendees).map((a) => [a.email, a.response]))
    const NOTIFY: Record<string, string> = {
      declined: 'activity.attendee.declined',
      tentativelyAccepted: 'activity.attendee.tentative',
    }
    for (const next of incoming) {
      const action = next.response ? NOTIFY[next.response] : null
      if (!action) continue
      const prevResp = prev.get(next.email) ?? null
      if (prevResp === next.response) continue // no change
      void this.audit.log({
        userId: existing.ownerId,
        action,
        entity: 'activity',
        entityId: existing.id,
        ip: null, userAgent: null,
        metadata: {
          attendeeEmail: next.email,
          attendeeName: next.name,
          previousResponse: prevResp,
          currentResponse: next.response,
          activityTitle: existing.title,
        },
      }).catch((err) => this.logger.warn(`Audit rsvp change failed: ${err instanceof Error ? err.message : err}`))
    }
  }

  private async fetchGraphDeltaPages(account: { id: string; accessToken: string; refreshToken: string | null; deltaLink: string | null }): Promise<DeltaPage[]> {
    const initial = account.deltaLink ?? this.buildInitialDeltaUrl()
    const pages: DeltaPage[] = []
    let url: string | undefined = initial
    let token = account.accessToken

    // Paginate through nextLinks until we get a deltaLink, then stop.
    while (url) {
      let res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } })
      if (res.status === 401 && account.refreshToken) {
        token = await this.refreshAndPersist(account.id, account.refreshToken)
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } })
      }
      if (res.status === 410) {
        // Delta token expired — restart from scratch. Clear stored deltaLink so the next
        // request builds a fresh window.
        await this.prisma.calendarSyncAccount.update({ where: { id: account.id }, data: { deltaLink: null } })
        url = this.buildInitialDeltaUrl()
        continue
      }
      if (!res.ok) throw new Error(`Graph ${res.status}`)
      const body = (await res.json()) as DeltaPage
      pages.push(body)
      url = body['@odata.nextLink']
      if (body['@odata.deltaLink']) break
    }
    return pages
  }

  private buildInitialDeltaUrl(): string {
    const from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const to = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString()
    return `https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}`
  }

  /**
   * Simulates a small delta lifecycle:
   *  - No deltaLink yet    → 2 new events + deltaLink 'dev-delta-1'
   *  - deltaLink=1         → update A, @removed B, deltaLink '2'
   *  - deltaLink=2         → 3 recurring occurrences + 1 all-day (should skip) + 1 seriesMaster
   *                          (should skip), deltaLink '3'
   *  - deltaLink=3         → 1 cancelled occurrence (event R2 is-cancelled=true), deltaLink '4'
   *  - deltaLink=4         → empty page, same deltaLink (steady state)
   * Event ids are namespaced by account so multiple stub accounts don't clash.
   */
  private devStubDeltaPages(accountId: string, email: string, deltaLink: string | null): DeltaPage[] {
    const idA = `dev-evt-a-${accountId}`
    const idB = `dev-evt-b-${accountId}`
    const idR = (n: number) => `dev-evt-r${n}-${accountId}`
    const idAllDay = `dev-evt-allday-${accountId}`
    const idMaster = `dev-evt-master-${accountId}`
    if (!deltaLink) {
      return [{
        value: [
          { id: idA, subject: 'M365 sync: weekly pipeline review',
            start: { dateTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString() },
            organizer: { emailAddress: { name: email } },
            attendees: [
              // Both start on 'accepted' so cycle 2 can fire both a decline (Krit) AND
              // a tentative-downgrade (Ploy) audit — exercises the broader RSVP alerts.
              { emailAddress: { address: 'krit@bluefishsolution.com', name: 'Krit' }, type: 'required',
                status: { response: 'accepted' } },
              { emailAddress: { address: 'ploy@bluefishsolution.com', name: 'Ploy' }, type: 'required',
                status: { response: 'accepted' } },
            ] },
          { id: idB, subject: 'M365 sync: quotation walkthrough with Thonburi',
            bodyPreview: 'Review pricing options with the customer.',
            start: { dateTime: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString() },
            organizer: { emailAddress: { name: email } },
            attendees: [
              // Real seed-data contact email — should get contactId/contactName populated.
              { emailAddress: { address: 'pimchanok.a@thonburimed.com', name: 'Pimchanok Aromdee' },
                status: { response: 'declined' } },
              { emailAddress: { address: 'somchai@bluefishsolution.com', name: 'Somchai' },
                status: { response: 'notResponded' } },
            ] },
        ],
        '@odata.deltaLink': 'dev-delta-1',
      }]
    }
    if (deltaLink === 'dev-delta-1') {
      return [{
        value: [
          // Event A moved + Krit's response flipped: accepted → declined. Ploy unchanged.
          // This simulates the RSVP-change signal the notification is designed to catch.
          { id: idA, subject: 'M365 sync: weekly pipeline review — MOVED to 10:00',
            start: { dateTime: new Date(Date.now() + 30 * 3600 * 1000).toISOString() },
            attendees: [
              { emailAddress: { address: 'krit@bluefishsolution.com', name: 'Krit' },
                type: 'required', status: { response: 'declined' } },
              { emailAddress: { address: 'ploy@bluefishsolution.com', name: 'Ploy' },
                type: 'required', status: { response: 'tentativelyAccepted' } },
            ] },
          { id: idB, '@removed': { reason: 'deleted' } },
        ],
        '@odata.deltaLink': 'dev-delta-2',
      }]
    }
    if (deltaLink === 'dev-delta-2') {
      return [{
        value: [
          // seriesMaster — should be skipped, don't want a single long "recurring" activity
          { id: idMaster, type: 'seriesMaster', subject: 'Standup (recurring — master)',
            start: { dateTime: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString() } },
          // 3 expanded occurrences
          { id: idR(1), type: 'occurrence', subject: 'Standup',
            start: { dateTime: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString() } },
          { id: idR(2), type: 'occurrence', subject: 'Standup',
            start: { dateTime: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString() } },
          { id: idR(3), type: 'occurrence', subject: 'Standup',
            start: { dateTime: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() } },
          // All-day — should be skipped
          { id: idAllDay, isAllDay: true, subject: 'Public holiday',
            start: { dateTime: '2026-08-12T00:00:00' } },
        ],
        '@odata.deltaLink': 'dev-delta-3',
      }]
    }
    if (deltaLink === 'dev-delta-3') {
      return [{
        value: [
          // Middle occurrence cancelled — activity should get status='cancelled', not deleted
          { id: idR(2), type: 'occurrence', isCancelled: true, subject: 'Standup',
            start: { dateTime: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString() } },
        ],
        '@odata.deltaLink': 'dev-delta-4',
      }]
    }
    if (deltaLink === 'dev-delta-4') {
      // Simulate a fresh occurrence whose master we OWN — should be SKIPPED by loop
      // prevention. Uses a fixed master id that the verify step will pre-create as an
      // activity's externalCalendarId.
      return [{
        value: [
          { id: `dev-occ-owned-${accountId}`, type: 'occurrence',
            seriesMasterId: `dev-owned-master-${accountId}`,
            subject: 'Recurring meeting — occurrence',
            start: { dateTime: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString() } },
        ],
        '@odata.deltaLink': 'dev-delta-5',
      }]
    }
    return [{ value: [], '@odata.deltaLink': deltaLink }]
  }

  private async refreshAndPersist(accountId: string, refreshToken: string): Promise<string> {
    const tokens = await this.refreshTokens(refreshToken)
    if (!tokens.access_token) throw new UnauthorizedException('Refresh returned no access_token')
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null
    await this.prisma.calendarSyncAccount.update({
      where: { id: accountId },
      data: {
        accessToken: tokens.access_token,
        // Microsoft may or may not rotate the refresh token — persist whichever we got.
        refreshToken: tokens.refresh_token ?? refreshToken,
        expiresAt,
      },
    })
    return tokens.access_token
  }

  /* ─────────────── Webhook subscriptions (Graph change notifications) ─────────────── */

  webhookPublicUrl(): string | null {
    return this.cfg.get<string>('MICROSOFT_WEBHOOK_URL') ?? null
  }

  /** Called after successful OAuth handshake. No-op if no public URL is configured. */
  async ensureWebhookSubscription(accountId: string): Promise<void> {
    const publicUrl = this.webhookPublicUrl()
    if (!publicUrl) return
    const account = await this.prisma.calendarSyncAccount.findUnique({ where: { id: accountId } })
    if (!account) return
    if (account.accessToken.startsWith('dev_stub')) {
      // Simulate a subscription so the storage path is testable.
      await this.prisma.calendarSyncAccount.update({
        where: { id: accountId },
        data: {
          webhookSubscriptionId: `dev-sub-${crypto.randomBytes(4).toString('hex')}`,
          webhookClientState: crypto.randomBytes(16).toString('base64url'),
          webhookExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      })
      return
    }
    if (account.webhookSubscriptionId && account.webhookExpiresAt && account.webhookExpiresAt > new Date(Date.now() + 12 * 60 * 60 * 1000)) {
      return // already valid for > 12h
    }
    const clientState = account.webhookClientState ?? crypto.randomBytes(24).toString('base64url')
    // Graph max for /me/events subscriptions is 4230 minutes (~2.9 days).
    const expiresAt = new Date(Date.now() + 4200 * 60 * 1000)
    const payload = {
      changeType: 'created,updated,deleted',
      notificationUrl: publicUrl,
      resource: '/me/events',
      expirationDateTime: expiresAt.toISOString(),
      clientState,
    }
    const created = await this.callGraph<{ id?: string }>(account, '/subscriptions', 'POST', payload)
    if (created?.id) {
      await this.prisma.calendarSyncAccount.update({
        where: { id: accountId },
        data: { webhookSubscriptionId: created.id, webhookClientState: clientState, webhookExpiresAt: expiresAt },
      })
    }
  }

  async renewWebhookSubscription(accountId: string): Promise<void> {
    const account = await this.prisma.calendarSyncAccount.findUnique({ where: { id: accountId } })
    if (!account?.webhookSubscriptionId) return
    if (account.accessToken.startsWith('dev_stub')) {
      await this.prisma.calendarSyncAccount.update({
        where: { id: accountId },
        data: { webhookExpiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      })
      return
    }
    const expiresAt = new Date(Date.now() + 4200 * 60 * 1000)
    await this.callGraph<void>(account, `/subscriptions/${encodeURIComponent(account.webhookSubscriptionId)}`, 'PATCH', {
      expirationDateTime: expiresAt.toISOString(),
    })
    await this.prisma.calendarSyncAccount.update({
      where: { id: accountId },
      data: { webhookExpiresAt: expiresAt },
    })
  }

  private async deleteWebhookSubscription(account: { id: string; accessToken: string; refreshToken: string | null; expiresAt: Date | null; webhookSubscriptionId: string | null }): Promise<void> {
    if (!account.webhookSubscriptionId) return
    if (account.accessToken.startsWith('dev_stub')) return
    try {
      await this.callGraph<void>(account, `/subscriptions/${encodeURIComponent(account.webhookSubscriptionId)}`, 'DELETE')
    } catch (err) {
      this.logger.warn(`Failed to delete subscription: ${err instanceof Error ? err.message : err}`)
    }
  }

  /**
   * Called from the notification receiver. Verifies clientState against what we stored,
   * then runs a delta sync — Graph notifications tell us *something* changed but not
   * exactly what, so delta is how we discover the specific event(s).
   */
  async handleNotification(notification: { subscriptionId?: string; clientState?: string }): Promise<void> {
    if (!notification.subscriptionId) return
    const account = await this.prisma.calendarSyncAccount.findFirst({
      where: { webhookSubscriptionId: notification.subscriptionId },
    })
    if (!account) return
    if (account.webhookClientState && notification.clientState !== account.webhookClientState) {
      this.logger.warn(`Rejected notification for ${account.email}: clientState mismatch`)
      return
    }
    await this.runSync(account)
  }

  private durationMinutes(evt: GraphEvent): number | null {
    if (!evt.start?.dateTime || !evt.end?.dateTime) return null
    const start = Date.parse(evt.start.dateTime)
    const end = Date.parse(evt.end.dateTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
    return Math.round((end - start) / 60000)
  }

  /* ─────────────── Outbound push (CRM → Outlook) ─────────────── */

  /**
   * Create an Outlook event mirroring a freshly-created Activity. No-op if the user
   * has no Microsoft account linked, or if the activity already carries an
   * externalCalendarId (meaning it was itself imported from a calendar — pushing it
   * back would form a sync loop).
   */
  async pushCreate(activityId: string, ownerId: string): Promise<void> {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId }, include: { owner: true } })
    if (!activity) return
    if (activity.externalCalendarId) return
    const account = await this.pickAccount(ownerId)
    if (!account) return
    const payload = this.buildGraphEvent({ ...activity, recurrence: activity.recurrence }, activity.owner.timezone)
    const created = await this.callGraph<{ id?: string }>(account, '/me/events', 'POST', payload)
    if (created?.id) {
      await this.prisma.activity.update({
        where: { id: activityId },
        data: {
          externalCalendarId: created.id,
          externalCalendarAccountId: account.id,
          calendarSyncedAt: new Date(),
        },
      })
    }
  }

  async pushUpdate(activityId: string): Promise<void> {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId }, include: { owner: true } })
    if (!activity?.externalCalendarId || !activity.externalCalendarAccountId) return
    const account = await this.prisma.calendarSyncAccount.findUnique({ where: { id: activity.externalCalendarAccountId } })
    if (!account) return
    const payload = this.buildGraphEvent({ ...activity, recurrence: activity.recurrence }, activity.owner.timezone)
    await this.callGraph<void>(account, `/me/events/${encodeURIComponent(activity.externalCalendarId)}`, 'PATCH', payload)
    await this.prisma.activity.update({ where: { id: activityId }, data: { calendarSyncedAt: new Date() } })
  }

  /** Delete uses the pre-delete snapshot because the row is already gone from the DB. */
  async pushDelete(activity: { externalCalendarId: string | null; externalCalendarAccountId: string | null }): Promise<void> {
    if (!activity.externalCalendarId || !activity.externalCalendarAccountId) return
    const account = await this.prisma.calendarSyncAccount.findUnique({ where: { id: activity.externalCalendarAccountId } })
    if (!account) return
    await this.callGraph<void>(account, `/me/events/${encodeURIComponent(activity.externalCalendarId)}`, 'DELETE')
  }

  private async pickAccount(ownerId: string) {
    // If a user has multiple Microsoft accounts, push to the most-recently-linked one.
    return this.prisma.calendarSyncAccount.findFirst({
      where: { userId: ownerId, provider: 'microsoft' },
      orderBy: { createdAt: 'desc' },
    })
  }

  private buildGraphEvent(a: {
    title: string; description: string | null; scheduledAt: Date; durationMin: number | null
    location: string | null; meetingLink: string | null; attendees: unknown; recurrence: unknown
  }, ownerTimezone: string): Record<string, unknown> {
    const startMs = a.scheduledAt.getTime()
    const endMs = startMs + (a.durationMin ?? 30) * 60_000
    // Graph accepts wall-clock time + IANA timezone. Sending in the owner's timezone means
    // Outlook shows the event at the correct local hour after DST transitions instead of
    // freezing to a UTC offset that drifts twice a year.
    const local = (ms: number) => this.toWallClock(new Date(ms), ownerTimezone)
    const normalisedAttendees = this.parseAttendees(a.attendees)
    return {
      subject: a.title,
      body: { contentType: 'HTML', content: a.description ?? '' },
      start: { dateTime: local(startMs), timeZone: ownerTimezone },
      end:   { dateTime: local(endMs),   timeZone: ownerTimezone },
      location: a.location ? { displayName: a.location } : undefined,
      isOnlineMeeting: Boolean(a.meetingLink) || undefined,
      attendees: normalisedAttendees.length > 0
        ? normalisedAttendees.map((att) => ({
            emailAddress: { address: att.email, name: att.name ?? undefined },
            type: 'required',
          }))
        : undefined,
      recurrence: this.buildGraphRecurrence(a.recurrence, a.scheduledAt, ownerTimezone),
    }
  }

  /**
   * Map our RecurrencePatternDto → Graph's recurrence shape. Returns undefined for
   * one-off events so the field is omitted from the payload.
   */
  private buildGraphRecurrence(raw: unknown, startInstant: Date, timeZone: string): Record<string, unknown> | undefined {
    if (!raw || typeof raw !== 'object') return undefined
    const r = raw as { type?: string; interval?: number; daysOfWeek?: unknown; endDate?: string }
    if (r.type !== 'daily' && r.type !== 'weekly' && r.type !== 'monthly') return undefined
    if (!r.endDate || typeof r.endDate !== 'string') return undefined
    const interval = Math.max(1, Math.floor(r.interval ?? 1))
    const startDateOnly = this.toWallClock(startInstant, timeZone).slice(0, 10)  // YYYY-MM-DD in owner tz
    const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
    // Default weekly to the weekday of scheduledAt so a "no day picked" state still yields
    // a valid Graph payload (weekday index in the owner timezone).
    const startWeekday = DAYS[new Date(startInstant).getUTCDay()]
    const providedDays = Array.isArray(r.daysOfWeek)
      ? r.daysOfWeek.filter((d): d is string => typeof d === 'string' && DAYS.includes(d as typeof DAYS[number]))
      : []
    const daysOfWeek = providedDays.length > 0 ? providedDays : [startWeekday]

    const pattern: Record<string, unknown> = r.type === 'daily'
      ? { type: 'daily', interval }
      : r.type === 'weekly'
      ? { type: 'weekly', interval, daysOfWeek, firstDayOfWeek: 'sunday' }
      : { type: 'absoluteMonthly', interval, dayOfMonth: new Date(startInstant).getUTCDate() }

    return {
      pattern,
      range: { type: 'endDate', startDate: startDateOnly, endDate: r.endDate },
    }
  }

  /** Tolerant parser — the Json column may still hold legacy string emails or newer objects. */
  parseAttendees(raw: unknown): Array<{ email: string; name: string | null; response: string | null; contactId: string | null }> {
    if (!Array.isArray(raw)) return []
    return raw
      .map((item) => {
        if (typeof item === 'string') return { email: item.toLowerCase(), name: null, response: null, contactId: null }
        if (item && typeof item === 'object') {
          const r = item as Record<string, unknown>
          const email = typeof r.email === 'string' ? r.email.toLowerCase() : null
          if (!email) return null
          return {
            email,
            name: typeof r.name === 'string' ? r.name : null,
            response: typeof r.response === 'string' ? r.response : null,
            // Manual override: user picked a specific Contact for this attendee. Wins over email-based auto-match.
            contactId: typeof r.contactId === 'string' ? r.contactId : null,
          }
        }
        return null
      })
      .filter((a): a is { email: string; name: string | null; response: string | null; contactId: string | null } => a !== null)
  }

  /**
   * Format a UTC instant as the wall-clock string ("2026-08-15T11:00:00.0000000") that
   * Graph expects when paired with an IANA timeZone. Uses Intl to translate — no
   * hard-coded offsets, DST-safe.
   */
  private toWallClock(instant: Date, timeZone: string): string {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value
        return acc
      }, {})
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:${parts.second}.0000000`
    } catch {
      // Unknown timezone — fall back to UTC ISO minus the Z.
      return instant.toISOString().replace(/Z$/, '')
    }
  }

  private async callGraph<T>(
    account: { id: string; accessToken: string; refreshToken: string | null; expiresAt: Date | null },
    path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown,
  ): Promise<T | null> {
    if (account.accessToken.startsWith('dev_stub')) {
      // Simulate a Graph response so the outbound path can be exercised without real M365 creds.
      // Log the recurrence block when present — useful when verifying pattern shape.
      const hasRecurrence = body && typeof body === 'object' && 'recurrence' in (body as Record<string, unknown>) && (body as Record<string, unknown>).recurrence
      this.logger.log(`[dev_stub] would ${method} ${path}${hasRecurrence ? ` recurrence=${JSON.stringify(hasRecurrence)}` : ''}`)
      if (method === 'POST') return { id: `dev-out-${crypto.randomBytes(4).toString('hex')}` } as unknown as T
      return null
    }
    let token = account.accessToken
    if (account.expiresAt && account.expiresAt < new Date() && account.refreshToken) {
      token = await this.refreshAndPersist(account.id, account.refreshToken)
    }
    const doRequest = (t: string) => fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let res = await doRequest(token)
    if (res.status === 401 && account.refreshToken) {
      token = await this.refreshAndPersist(account.id, account.refreshToken)
      res = await doRequest(token)
    }
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`Graph ${method} ${path} → ${res.status}: ${detail.slice(0, 200)}`)
    }
    if (res.status === 204) return null
    const ct = res.headers.get('content-type') ?? ''
    return ct.includes('application/json') ? ((await res.json()) as T) : null
  }
}
