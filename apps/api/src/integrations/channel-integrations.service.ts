import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { AuditRequestContext } from '../common/request-context'
import type { ChannelFieldSpec, ChannelIntegrationDto, ChannelIntegrationType, UpsertChannelIntegrationDto } from '@bluefish/shared'
import { CHANNEL_INTEGRATION_TYPES } from '@bluefish/shared'
import { decryptSecret, encryptSecret, maskSecret } from './crypto'

/**
 * The set of secret keys we accept per channel, and how to render them in the
 * Settings UI. Adding a channel = add a row here + wire the webhook.
 *
 * `secret: true` fields are masked in list responses; the UI must never see the
 * plaintext once it's been saved. `secret: false` (e.g. verify token that gets
 * displayed anyway) is returned in the clear.
 */
const CHANNEL_FIELDS: Record<ChannelIntegrationType, ChannelFieldSpec[]> = {
  'LINE OA': [
    { key: 'channelSecret',       label: 'Channel Secret',      type: 'secret', required: true,  hint: 'From LINE Developers Console → Messaging API' },
    { key: 'channelAccessToken',  label: 'Channel Access Token',type: 'secret', required: true,  hint: 'Long-lived access token — used for outbound replies' },
  ],
  Messenger: [
    { key: 'appSecret',        label: 'Meta App Secret',    type: 'secret', required: true,  hint: 'Meta for Developers → App → Settings' },
    { key: 'verifyToken',      label: 'Verify Token',       type: 'text',   required: true,  hint: 'Any string — paste the same value in Meta Webhooks setup' },
    { key: 'pageAccessToken',  label: 'Page Access Token',  type: 'secret', required: false, hint: 'Optional — required for outbound send' },
  ],
  Website: [
    { key: 'sharedKey',        label: 'Shared form key',    type: 'secret', required: true,  hint: 'Paste this key in the contact form as x-bluefish-form-key header' },
  ],
  Email: [
    { key: 'inboundAddress',   label: 'Inbound address',    type: 'text',   required: false, hint: 'Forwarding address for inbound parse (SendGrid / Postmark webhook target)' },
    { key: 'signingSecret',    label: 'Webhook signing secret', type: 'secret', required: false, hint: 'HMAC key used by the inbound-parse provider' },
  ],
}

/** Env-var fallbacks so an existing deployment keeps working before someone
 *  saves the config in the UI. */
const ENV_FALLBACK: Record<ChannelIntegrationType, Record<string, string>> = {
  'LINE OA':  { channelSecret: 'LINE_CHANNEL_SECRET', channelAccessToken: 'LINE_CHANNEL_ACCESS_TOKEN' },
  Messenger:  { appSecret: 'META_APP_SECRET', verifyToken: 'FB_VERIFY_TOKEN', pageAccessToken: 'FB_PAGE_ACCESS_TOKEN' },
  Website:    { sharedKey: 'INBOX_WEBSITE_KEY' },
  Email:      { inboundAddress: 'INBOX_EMAIL_ADDRESS', signingSecret: 'INBOX_EMAIL_SIGNING_SECRET' },
}

@Injectable()
export class ChannelIntegrationsService {
  constructor(
    private prisma: PrismaService,
    private cfg: ConfigService,
    private audit: AuditService,
  ) {}

  /** Absolute webhook URL for the given channel — reads PUBLIC_API_URL, then request host. */
  webhookUrl(channel: ChannelIntegrationType): string {
    const base = (this.cfg.get<string>('PUBLIC_API_URL') ?? 'http://localhost:4000/api').replace(/\/$/, '')
    const path = channel === 'LINE OA' ? 'line'
      : channel === 'Messenger' ? 'facebook'
      : channel === 'Website' ? 'website'
      : 'email'
    return `${base}/webhooks/inbox/${path}`
  }

  /** List one row per channel — even ones with no stored config get a placeholder. */
  async list(): Promise<ChannelIntegrationDto[]> {
    const rows = await this.prisma.channelIntegration.findMany({ orderBy: { channel: 'asc' } })
    return CHANNEL_INTEGRATION_TYPES.map((channel) => {
      const row = rows.find((r) => r.channel === channel && r.label === 'Default') ?? null
      return this.toDto(channel, row)
    })
  }

  async get(channel: ChannelIntegrationType): Promise<ChannelIntegrationDto> {
    this.assertChannel(channel)
    const row = await this.prisma.channelIntegration.findFirst({ where: { channel, label: 'Default' } })
    return this.toDto(channel, row)
  }

  /**
   * Upsert-by-channel. Merges the incoming plaintext values with any existing
   * decrypted ones — empty strings in the payload delete that field.
   */
  async upsert(channel: ChannelIntegrationType, input: UpsertChannelIntegrationDto, ctx: AuditRequestContext): Promise<ChannelIntegrationDto> {
    this.assertChannel(channel)
    const label = input.label?.trim() || 'Default'
    const fields = CHANNEL_FIELDS[channel]

    const existing = await this.prisma.channelIntegration.findFirst({ where: { channel, label } })
    const prior = existing ? (decryptSecret<Record<string, string>>(existing.credentials) ?? {}) : {}

    // Merge: prior values remain unless the caller supplied a new one.
    // An empty string means "clear this field".
    const next: Record<string, string> = { ...prior }
    for (const [k, v] of Object.entries(input.values ?? {})) {
      if (v === undefined) continue
      const trimmed = v.trim()
      if (trimmed === '') delete next[k]
      else next[k] = trimmed
    }

    // Validate required fields — only when the caller intends to activate.
    const willBeActive = input.isActive ?? existing?.isActive ?? true
    if (willBeActive) {
      const missing = fields.filter((f) => f.required && !next[f.key]).map((f) => f.label)
      if (missing.length > 0) {
        throw new BadRequestException(`Missing required field(s): ${missing.join(', ')}`)
      }
    }

    const credentials = encryptSecret(next)
    const savedRow = existing
      ? await this.prisma.channelIntegration.update({
          where: { id: existing.id },
          data: { credentials, label, isActive: input.isActive ?? existing.isActive },
        })
      : await this.prisma.channelIntegration.create({
          data: {
            channel, label, credentials,
            isActive: input.isActive ?? true,
            createdById: ctx.userId ?? null,
          },
        })

    await this.audit.log({
      ...ctx, action: existing ? 'channel_integration.update' : 'channel_integration.create',
      entity: 'channel_integration', entityId: savedRow.id,
      metadata: { channel, updatedFields: Object.keys(input.values ?? {}) },
    })

    return this.toDto(channel, savedRow)
  }

  async remove(channel: ChannelIntegrationType, ctx: AuditRequestContext): Promise<void> {
    this.assertChannel(channel)
    const existing = await this.prisma.channelIntegration.findFirst({ where: { channel, label: 'Default' } })
    if (!existing) throw new NotFoundException('No configuration to remove')
    await this.prisma.channelIntegration.delete({ where: { id: existing.id } })
    await this.audit.log({ ...ctx, action: 'channel_integration.delete', entity: 'channel_integration', entityId: existing.id, metadata: { channel } })
  }

  /**
   * Read decrypted credentials for internal use by webhooks. Falls back to env
   * vars when nothing is configured in DB. Returns `null` only when there is
   * no config anywhere — callers can decide what to do (skip validation, etc).
   */
  async getPlain(channel: ChannelIntegrationType): Promise<Record<string, string> | null> {
    const row = await this.prisma.channelIntegration.findFirst({ where: { channel, label: 'Default' } })
    if (row && row.isActive) {
      const decrypted = decryptSecret<Record<string, string>>(row.credentials)
      if (decrypted && Object.keys(decrypted).length > 0) return decrypted
    }
    // Env fallback — pull whatever's set for this channel.
    const fallback: Record<string, string> = {}
    for (const [key, envName] of Object.entries(ENV_FALLBACK[channel] ?? {})) {
      const v = this.cfg.get<string>(envName)
      if (v) fallback[key] = v
    }
    return Object.keys(fallback).length > 0 ? fallback : null
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private assertChannel(channel: string): asserts channel is ChannelIntegrationType {
    if (!CHANNEL_INTEGRATION_TYPES.includes(channel as ChannelIntegrationType)) {
      throw new BadRequestException(`Unknown channel "${channel}"`)
    }
  }

  private toDto(channel: ChannelIntegrationType, row: { id: string; channel: string; label: string; credentials: string; isActive: boolean; createdAt: Date; updatedAt: Date } | null): ChannelIntegrationDto {
    const fields = CHANNEL_FIELDS[channel]
    const plain = row ? (decryptSecret<Record<string, string>>(row.credentials) ?? {}) : {}

    const maskedValues: Record<string, string> = {}
    for (const f of fields) {
      const v = plain[f.key]
      if (!v) { maskedValues[f.key] = ''; continue }
      maskedValues[f.key] = f.type === 'secret' ? maskSecret(v) : v
    }

    return {
      id: row?.id ?? `${channel}::placeholder`,
      channel,
      label: row?.label ?? 'Default',
      isActive: row?.isActive ?? false,
      webhookUrl: this.webhookUrl(channel),
      fields,
      maskedValues,
      hasCredentials: Object.values(plain).some((v) => v && v.length > 0),
      createdAt: row?.createdAt.toISOString() ?? new Date().toISOString(),
      updatedAt: row?.updatedAt.toISOString() ?? new Date().toISOString(),
    }
  }
}
