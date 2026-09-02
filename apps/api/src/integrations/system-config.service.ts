/**
 * Runtime config store — key/value with the value AES-GCM encrypted at rest.
 * Currently used for OCR provider API keys the admin sets in Settings
 * without needing shell access to edit .env.
 *
 * Keep the surface tiny (get/set/list) so future consumers stay honest —
 * this is not a general-purpose feature flag or user preferences store.
 */

import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { decryptSecret, encryptSecret, maskSecret } from './crypto'

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name)

  constructor(private prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } })
    if (!row) return null
    const decrypted = decryptSecret<string>(row.value)
    return typeof decrypted === 'string' ? decrypted : null
  }

  /** Pass an empty/null `value` to delete the row. */
  async set(key: string, value: string | null, updatedBy: string | null): Promise<void> {
    if (!value) {
      await this.prisma.systemConfig.deleteMany({ where: { key } })
      return
    }
    const encrypted = encryptSecret(value)
    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value: encrypted, updatedBy },
      update: { value: encrypted, updatedBy },
    })
  }

  async getMasked(key: string): Promise<string | null> {
    const v = await this.get(key)
    return v ? maskSecret(v) : null
  }
}
