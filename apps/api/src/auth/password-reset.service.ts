import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { MailerService } from '../mailer/mailer.service'
import { TokensService } from './tokens.service'
import { validatePasswordPolicy } from './password-policy'
import type { AuditRequestContext } from '../common/request-context'

const RESET_TTL_MS = 60 * 60 * 1000 // 1 hour

@Injectable()
export class PasswordResetService {
  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
    private audit: AuditService,
    private tokens: TokensService,
    private cfg: ConfigService,
  ) {}

  async request(email: string, ctx: AuditRequestContext): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    // Return silently regardless of whether email exists — don't leak account existence
    if (!user) {
      await this.audit.log({
        action: 'user.password.reset.request', entity: 'user',
        ip: ctx.ip, userAgent: ctx.userAgent, metadata: { email, outcome: 'no_such_user' },
      })
      return
    }
    const rawToken = crypto.randomBytes(48).toString('base64url')
    const tokenHash = this.tokens.hash(rawToken)
    const expiresAt = new Date(Date.now() + RESET_TTL_MS)

    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } })

    const base = this.cfg.get<string>('WEB_BASE_URL') ?? 'http://localhost:5173'
    const link = `${base}/reset-password?token=${rawToken}`
    await this.mailer.send({
      to: user.email,
      subject: 'Bluefish CRM — Reset your password',
      text: `Hello ${user.name},\n\nWe received a request to reset your Bluefish CRM password.\n\nClick this link within 1 hour: ${link}\n\nIf you didn't request this, you can ignore this email.\n\n— Bluefish CRM`,
    })
    await this.audit.log({
      userId: user.id, action: 'user.password.reset.request', entity: 'user', entityId: user.id,
      ip: ctx.ip, userAgent: ctx.userAgent,
    })
  }

  async complete(rawToken: string, newPassword: string, ctx: AuditRequestContext): Promise<void> {
    const errors = validatePasswordPolicy(newPassword)
    if (errors.length > 0) throw new UnauthorizedException(errors.join(', '))

    const tokenHash = this.tokens.hash(rawToken)
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } })
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      await this.audit.log({
        action: 'user.password.reset.complete', entity: 'password_reset_token',
        ip: ctx.ip, userAgent: ctx.userAgent, metadata: { outcome: 'invalid_or_expired' },
      })
      throw new UnauthorizedException('Reset link is invalid or expired')
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ])
    await this.tokens.revokeAllForUser(record.userId)
    await this.audit.log({
      userId: record.userId, action: 'user.password.reset.complete', entity: 'user', entityId: record.userId,
      ip: ctx.ip, userAgent: ctx.userAgent,
    })
  }
}
