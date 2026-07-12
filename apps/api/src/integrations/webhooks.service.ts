import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateWebhookDto, WebhookSubscriptionDto } from '@bluefish/shared'

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name)

  constructor(private prisma: PrismaService) {}

  async list(): Promise<WebhookSubscriptionDto[]> {
    const rows = await this.prisma.webhookSubscription.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map((r) => this.toDto(r))
  }

  async create(input: CreateWebhookDto, userId: string): Promise<WebhookSubscriptionDto> {
    const secret = crypto.randomBytes(24).toString('base64url')
    const row = await this.prisma.webhookSubscription.create({
      data: { url: input.url, secret, events: input.events.join(','), createdById: userId },
    })
    return this.toDto(row)
  }

  async delete(id: string): Promise<void> {
    const row = await this.prisma.webhookSubscription.findUnique({ where: { id } })
    if (!row) throw new NotFoundException()
    await this.prisma.webhookSubscription.delete({ where: { id } })
  }

  /** Dispatch an event to every active subscription that listens for it. */
  async dispatch(event: string, payload: unknown): Promise<void> {
    const active = await this.prisma.webhookSubscription.findMany({ where: { isActive: true } })
    for (const sub of active) {
      const events = sub.events.split(',').map((s) => s.trim())
      if (!events.includes(event) && !events.includes('*')) continue
      void this.deliver(sub, event, payload)
    }
  }

  private async deliver(sub: { id: string; url: string; secret: string }, event: string, payload: unknown) {
    try {
      const body = JSON.stringify({ event, data: payload })
      const signature = crypto.createHmac('sha256', sub.secret).update(body).digest('hex')
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bluefish-signature': signature, 'x-bluefish-event': event },
        body,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await this.prisma.webhookSubscription.update({ where: { id: sub.id }, data: { lastDeliveryAt: new Date(), lastError: null } })
    } catch (err) {
      this.logger.error(`Webhook delivery failed for ${sub.url}`, err as Error)
      await this.prisma.webhookSubscription.update({
        where: { id: sub.id },
        data: { lastError: err instanceof Error ? err.message : String(err) },
      })
    }
  }

  private toDto(row: { id: string; url: string; events: string; isActive: boolean; lastDeliveryAt: Date | null; lastError: string | null; createdAt: Date }): WebhookSubscriptionDto {
    return {
      id: row.id, url: row.url,
      events: row.events.split(',').filter(Boolean),
      isActive: row.isActive,
      lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
      lastError: row.lastError, createdAt: row.createdAt.toISOString(),
    }
  }
}
