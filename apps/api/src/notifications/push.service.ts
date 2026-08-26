import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import webpush from 'web-push'
import { PrismaService } from '../prisma/prisma.service'

export interface PushPayload {
  title: string
  body?: string
  url?: string        // path within the app to open on click
  tag?: string        // OS de-duplication (same tag replaces older notification)
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name)
  private configured = false
  private publicKey = ''

  constructor(private prisma: PrismaService, config: ConfigService) {
    const pub = config.get<string>('VAPID_PUBLIC_KEY') ?? ''
    const priv = config.get<string>('VAPID_PRIVATE_KEY') ?? ''
    const contact = config.get<string>('VAPID_CONTACT') ?? 'mailto:admin@example.com'
    if (pub && priv) {
      webpush.setVapidDetails(contact, pub, priv)
      this.configured = true
      this.publicKey = pub
    } else {
      this.logger.warn('VAPID keys not configured — push notifications will no-op')
    }
  }

  getPublicKey(): string | null {
    return this.configured ? this.publicKey : null
  }

  isReady(): boolean { return this.configured }

  async sendToUser(userId: string, payload: PushPayload): Promise<{ ok: number; gone: number; failed: number }> {
    if (!this.configured) return { ok: 0, gone: 0, failed: 0 }
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } })
    let ok = 0, gone = 0, failed = 0
    const body = JSON.stringify(payload)
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
        await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date() } })
        ok++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode ?? 0
        if (status === 404 || status === 410) {
          // Subscription expired / user unsubscribed — drop it
          await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
          gone++
        } else {
          await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastErrorAt: new Date() } }).catch(() => {})
          failed++
          this.logger.warn(`Push to ${s.endpoint.slice(0, 40)}… failed [${status}] — ${(e as Error).message}`)
        }
      }
    }))
    return { ok, gone, failed }
  }
}
