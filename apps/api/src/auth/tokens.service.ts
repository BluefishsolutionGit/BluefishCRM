import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'

const REFRESH_TTL_DAYS = 7

@Injectable()
export class TokensService {
  private readonly refreshTtlMs: number

  constructor(private jwt: JwtService, private cfg: ConfigService, private prisma: PrismaService) {
    this.refreshTtlMs = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
  }

  async issueAccessToken(payload: { sub: string; email: string; role: string }): Promise<string> {
    return this.jwt.signAsync(payload, {
      expiresIn: this.cfg.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    })
  }

  async issueRefreshToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(48).toString('base64url')
    const tokenHash = this.hash(token)
    const expiresAt = new Date(Date.now() + this.refreshTtlMs)
    await this.prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } })
    return { token, expiresAt }
  }

  async rotateRefreshToken(rawToken: string): Promise<{
    userId: string
    newAccessToken: string
    newRefreshToken: string
    expiresAt: Date
  } | null> {
    const tokenHash = this.hash(rawToken)
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: true } } },
    })
    if (!record || record.revokedAt || record.expiresAt < new Date()) return null

    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } })

    const u = record.user
    const newAccessToken = await this.issueAccessToken({ sub: u.id, email: u.email, role: u.role.name })
    const next = await this.issueRefreshToken(u.id)
    return { userId: u.id, newAccessToken, newRefreshToken: next.token, expiresAt: next.expiresAt }
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = this.hash(rawToken)
    await this.prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
  }

  hash(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex')
  }
}
