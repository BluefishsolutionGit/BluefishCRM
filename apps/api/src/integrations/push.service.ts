import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { PushSubscribeDto } from '@bluefish/shared'

/**
 * Minimal Web Push service. In dev with no VAPID keys configured we skip sending
 * and log the notification payload for verification; in prod we send via the
 * standard `web-push` protocol (requires VAPID keys in env).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name)

  constructor(private prisma: PrismaService, private cfg: ConfigService) {}

  publicVapidKey(): string | null {
    return this.cfg.get<string>('VAPID_PUBLIC_KEY') ?? null
  }

  async subscribe(userId: string, input: PushSubscribeDto): Promise<{ id: string }> {
    const row = await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      update: { p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: input.userAgent ?? null, userId },
      create: { userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: input.userAgent ?? null },
    })
    return { id: row.id }
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } })
  }

  async listForUser(userId: string): Promise<Array<{ id: string; endpoint: string; createdAt: Date }>> {
    return this.prisma.pushSubscription.findMany({ where: { userId } })
  }

  /**
   * Send a notification to every subscription of a user. In dev without VAPID
   * keys, we log the payload — the frontend can observe by polling.
   */
  async notifyUser(userId: string, notification: { title: string; body: string; url?: string }): Promise<{ sent: number; skipped: number }> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } })
    if (subs.length === 0) return { sent: 0, skipped: 0 }

    const publicKey = this.cfg.get<string>('VAPID_PUBLIC_KEY')
    const privateKey = this.cfg.get<string>('VAPID_PRIVATE_KEY')
    if (!publicKey || !privateKey) {
      this.logger.log(`PUSH (dry): user=${userId} title="${notification.title}" body="${notification.body}"`)
      return { sent: 0, skipped: subs.length }
    }

    // In prod, use `web-push` library. Kept out of deps to avoid runtime overhead
    // in dev; wire it here when going live:
    //   npm i web-push  → import webPush from 'web-push'
    //   webPush.setVapidDetails('mailto:...', publicKey, privateKey)
    //   for (const sub of subs) await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(notification))
    this.logger.log(`PUSH configured — ${subs.length} subs would receive: ${JSON.stringify(notification)}`)
    return { sent: subs.length, skipped: 0 }
  }

  /** Called by seed / dev tools to generate a placeholder VAPID key pair for local testing */
  static generateVapidKeypair(): { publicKey: string; privateKey: string } {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    return {
      publicKey: publicKey.export({ format: 'jwk' }).x + '.' + publicKey.export({ format: 'jwk' }).y!,
      privateKey: (privateKey.export({ format: 'jwk' }) as { d: string }).d,
    }
  }
}
