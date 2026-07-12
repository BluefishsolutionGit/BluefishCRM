import { Injectable, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { ApiKeyDto, CreateApiKeyDto, CreatedApiKeyDto } from '@bluefish/shared'

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  async list(): Promise<ApiKeyDto[]> {
    const rows = await this.prisma.apiKey.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map((r) => this.toDto(r))
  }

  async create(input: CreateApiKeyDto, userId: string): Promise<CreatedApiKeyDto> {
    const raw = crypto.randomBytes(32).toString('base64url')
    const key = `bf_${raw}`
    const prefix = key.slice(0, 8)
    const keyHash = crypto.createHash('sha256').update(key).digest('hex')

    const row = await this.prisma.apiKey.create({
      data: { name: input.name, prefix, keyHash, scopes: input.scopes.join(','), createdById: userId },
    })
    return { ...this.toDto(row), key }
  }

  async revoke(id: string): Promise<void> {
    const row = await this.prisma.apiKey.findUnique({ where: { id } })
    if (!row) throw new NotFoundException()
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } })
  }

  async verifyKey(rawKey: string): Promise<{ id: string; scopes: string[] } | null> {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
    const row = await this.prisma.apiKey.findUnique({ where: { keyHash } })
    if (!row || row.revokedAt) return null
    await this.prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    return { id: row.id, scopes: row.scopes.split(',').filter(Boolean) }
  }

  private toDto(row: { id: string; name: string; prefix: string; scopes: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }): ApiKeyDto {
    return {
      id: row.id, name: row.name, prefix: row.prefix,
      scopes: row.scopes.split(',').filter(Boolean),
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
    }
  }
}
