import { Body, Controller, ForbiddenException, Headers, HttpCode, Logger, Post, Query, Req } from '@nestjs/common'
import * as crypto from 'crypto'
import { InboxService } from './inbox.service'
import { ChannelIntegrationsService } from '../integrations/channel-integrations.service'
import type { Request } from 'express'
import type { InboxChannel } from '@bluefish/shared'

interface LineEvent {
  type: string
  timestamp: number
  source?: { userId?: string; type?: string }
  message?: { id?: string; type?: string; text?: string }
}
interface LinePayload { events: LineEvent[]; destination?: string }

interface FbMessagingEvent {
  sender?: { id?: string }
  timestamp?: number
  message?: { mid?: string; text?: string }
}
interface FbPayload { object?: string; entry?: Array<{ messaging?: FbMessagingEvent[] }> }

@Controller('webhooks/inbox')
export class InboxWebhooksController {
  private readonly logger = new Logger(InboxWebhooksController.name)

  constructor(private inbox: InboxService, private channels: ChannelIntegrationsService) {}

  @Post('line')
  @HttpCode(200)
  async line(
    @Headers('x-line-signature') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: LinePayload,
  ) {
    const config = await this.channels.getPlain('LINE OA')
    const secret = config?.channelSecret ?? ''
    if (secret && signature) {
      const raw = req.rawBody ?? Buffer.from(JSON.stringify(body))
      const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64')
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        throw new ForbiddenException('Invalid signature')
      }
    }

    const results: Array<{ threadId: string; messageId: string }> = []
    for (const e of body.events ?? []) {
      if (e.type !== 'message' || e.message?.type !== 'text') continue
      const userId = e.source?.userId ?? 'unknown'
      const text = e.message?.text ?? ''
      const authorName = `LINE user ${userId.slice(-4)}`
      const res = await this.inbox.ingestIncoming({
        channel: 'LINE OA',
        externalThreadId: userId,
        externalMessageId: e.message?.id,
        authorName, text,
        sentAt: e.timestamp ? new Date(e.timestamp) : new Date(),
      })
      results.push(res)
    }
    return { ok: true, ingested: results.length }
  }

  @Post('facebook')
  @HttpCode(200)
  async facebook(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: FbPayload,
  ) {
    return this.metaHandler('Messenger', signature, req, body)
  }

  /** FB verification handshake (GET is exposed via a separate endpoint below, but for simplicity we handle inside POST) */
  @Post('facebook/verify')
  async fbVerify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    const config = await this.channels.getPlain('Messenger')
    const verifyToken = config?.verifyToken ?? ''
    if (mode === 'subscribe' && token === verifyToken) return challenge
    throw new ForbiddenException()
  }

  /**
   * Bluefish company contact form (www.bluefishsolution.com/en/contact-us).
   *
   * The site posts a JSON envelope with the visitor's name/email/message.
   * We accept a lightweight shared-secret in `x-bluefish-form-key` so the
   * public site can push into the CRM without a full auth flow. When
   * the sharedKey isn't configured (via DB or env) the endpoint is open
   * (dev/demo mode).
   *
   * The visitor's email doubles as the external thread id so subsequent
   * follow-ups from the same address collapse into one thread.
   */
  @Post('website')
  @HttpCode(200)
  async website(
    @Headers('x-bluefish-form-key') secret: string | undefined,
    @Body() body: { name?: string; email?: string; company?: string; subject?: string; message?: string; phone?: string },
  ) {
    const config = await this.channels.getPlain('Website')
    const expected = config?.sharedKey ?? ''
    if (expected && secret !== expected) throw new ForbiddenException('Invalid form key')
    const email = (body.email ?? '').trim().toLowerCase()
    const message = (body.message ?? '').trim()
    if (!email || !message) return { ok: false, error: 'email + message required' }

    const subject = (body.subject ?? '').trim()
    const text = subject ? `${subject}\n\n${message}` : message
    const authorName = (body.name ?? '').trim() || email
    const res = await this.inbox.ingestIncoming({
      channel: 'Website',
      externalThreadId: email,
      externalMessageId: undefined,
      authorName, text,
      sentAt: new Date(),
    })
    return { ok: true, ...res }
  }

  private async metaHandler(channel: InboxChannel, signature: string | undefined, req: Request & { rawBody?: Buffer }, body: FbPayload) {
    const config = await this.channels.getPlain('Messenger')
    const secret = config?.appSecret ?? ''
    if (secret && signature) {
      const raw = req.rawBody ?? Buffer.from(JSON.stringify(body))
      const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
      if (signature !== expected) throw new ForbiddenException('Invalid signature')
    }

    let count = 0
    for (const entry of body.entry ?? []) {
      for (const msg of entry.messaging ?? []) {
        if (!msg.message?.text) continue
        const externalId = msg.sender?.id ?? 'unknown'
        await this.inbox.ingestIncoming({
          channel,
          externalThreadId: externalId,
          externalMessageId: msg.message.mid,
          authorName: `${channel} user ${externalId.slice(-4)}`,
          text: msg.message.text,
          sentAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        })
        count++
      }
    }
    return { ok: true, ingested: count }
  }
}
