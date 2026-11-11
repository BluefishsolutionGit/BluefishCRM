import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaService } from '../prisma/prisma.service'
import { decryptSecret, encryptSecret } from '../integrations/crypto'
import type { AiKeyDto, AiKeyProvider, CreateAiKeyDto, TestAiKeyResultDto } from '@bluefish/shared'

interface KeyBlob { apiKey: string }

@Injectable()
export class UserAiKeysService {
  private readonly logger = new Logger(UserAiKeysService.name)

  constructor(private prisma: PrismaService) {}

  async list(userId: string): Promise<AiKeyDto[]> {
    const rows = await this.prisma.userAiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => this.toDto(r))
  }

  async create(userId: string, input: CreateAiKeyDto): Promise<AiKeyDto> {
    const apiKey = (input.apiKey ?? '').trim()
    const provider = input.provider
    const label = (input.label ?? 'Default').trim() || 'Default'
    if (provider !== 'anthropic') throw new BadRequestException('Only "anthropic" is supported for now')
    // Minimal shape check so we don't persist obvious garbage. Not foolproof —
    // the Test button does a real ping afterwards.
    if (!apiKey.startsWith('sk-ant-') || apiKey.length < 20) {
      throw new BadRequestException('That doesn\'t look like a valid Anthropic API key (expected sk-ant-…)')
    }
    try {
      return this.toDto(await this.prisma.userAiKey.create({
        data: {
          userId, provider, label,
          encryptedKey: encryptSecret({ apiKey } satisfies KeyBlob),
        },
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('Unique constraint')) {
        throw new ConflictException(`You already have an "${label}" key for ${provider} — rename it or delete the old one first.`)
      }
      throw err
    }
  }

  async delete(userId: string, id: string): Promise<void> {
    const row = await this.prisma.userAiKey.findUnique({ where: { id } })
    if (!row || row.userId !== userId) throw new NotFoundException('Key not found')
    await this.prisma.userAiKey.delete({ where: { id } })
  }

  async test(userId: string, id: string): Promise<TestAiKeyResultDto> {
    const row = await this.prisma.userAiKey.findUnique({ where: { id } })
    if (!row || row.userId !== userId) throw new NotFoundException('Key not found')
    const blob = decryptSecret<KeyBlob>(row.encryptedKey)
    if (!blob?.apiKey) return { ok: false, message: 'Decrypt failed — key is unusable' }

    try {
      const client = new Anthropic({ apiKey: blob.apiKey })
      // Smallest possible real call — one-token reply confirms both auth
      // and that the account has credits. Haiku keeps the cost microscopic.
      const resp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      })
      await this.prisma.userAiKey.update({ where: { id }, data: { lastUsedAt: new Date() } })
      return { ok: true, message: `OK — model ${resp.model} responded.` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`AI key test failed for user ${userId}: ${msg}`)
      return { ok: false, message: msg.slice(0, 240) }
    }
  }

  /**
   * Returns the decrypted plaintext API key for the user's first active key
   * of the given provider, or null when they haven't added one.
   * Called by LlmClient to decide between personal key and env fallback.
   * Updates lastUsedAt as a side effect (fire-and-forget, non-blocking).
   */
  async resolveKey(userId: string, provider: AiKeyProvider): Promise<string | null> {
    const row = await this.prisma.userAiKey.findFirst({
      where: { userId, provider },
      orderBy: { createdAt: 'desc' },
    })
    if (!row) return null
    const blob = decryptSecret<KeyBlob>(row.encryptedKey)
    if (!blob?.apiKey) return null
    // Non-blocking lastUsedAt bump; a failed update shouldn't fail the agent run.
    void this.prisma.userAiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
    return blob.apiKey
  }

  private toDto(row: { id: string; provider: string; label: string; encryptedKey: string; createdAt: Date; lastUsedAt: Date | null }): AiKeyDto {
    const blob = decryptSecret<KeyBlob>(row.encryptedKey)
    const keyPreview = blob?.apiKey ? `…${blob.apiKey.slice(-4)}` : '…????'
    return {
      id: row.id,
      provider: row.provider as AiKeyProvider,
      label: row.label,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      keyPreview,
    }
  }
}
