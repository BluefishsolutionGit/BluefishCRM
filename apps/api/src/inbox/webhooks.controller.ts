import { Body, Controller, ForbiddenException, Headers, HttpCode, Logger, Post, Query, Req } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { InboxService } from './inbox.service'
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

  constructor(private inbox: InboxService, private cfg: ConfigService) {}

  @Post('line')
  @HttpCode(200)
  async line(
    @Headers('x-line-signature') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: LinePayload,
  ) {
    const secret = this.cfg.get<string>('LINE_CHANNEL_SECRET') ?? ''
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
  fbVerify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    const verifyToken = this.cfg.get<string>('FB_VERIFY_TOKEN') ?? ''
    if (mode === 'subscribe' && token === verifyToken) return challenge
    throw new ForbiddenException()
  }

  @Post('instagram')
  @HttpCode(200)
  async instagram(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: FbPayload,
  ) {
    return this.metaHandler('Instagram', signature, req, body)
  }

  private async metaHandler(channel: InboxChannel, signature: string | undefined, req: Request & { rawBody?: Buffer }, body: FbPayload) {
    const secret = this.cfg.get<string>('META_APP_SECRET') ?? ''
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
