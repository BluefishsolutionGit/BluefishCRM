import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { UsersService } from '../users/users.service'
import { AuditService } from '../audit/audit.service'
import { TokensService } from './tokens.service'
import { MfaService } from './mfa.service'
import { permissionsFor } from './permissions'
import type { LoginOutcome, LoginResponse } from '@bluefish/shared'

export interface LoginContext {
  ip?: string | null
  userAgent?: string | null
}

export type LoginResult =
  | (LoginResponse & { refreshToken: string; refreshExpiresAt: Date })
  | { requiresMfa: true; mfaToken: string }

interface MfaChallengePayload { sub: string; mfaChallenge: true }

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private tokens: TokensService,
    private jwt: JwtService,
    private audit: AuditService,
    private mfa: MfaService,
  ) {}

  async login(email: string, password: string, ctx: LoginContext = {}): Promise<LoginResult> {
    const u = await this.users.findByEmail(email)
    if (!u) {
      await this.audit.log({
        action: 'user.login.failure', entity: 'user',
        ip: ctx.ip, userAgent: ctx.userAgent, metadata: { email, reason: 'not_found' },
      })
      throw new UnauthorizedException('Invalid credentials')
    }
    const ok = await bcrypt.compare(password, u.passwordHash)
    if (!ok) {
      await this.audit.log({
        userId: u.id, action: 'user.login.failure', entity: 'user', entityId: u.id,
        ip: ctx.ip, userAgent: ctx.userAgent, metadata: { email, reason: 'bad_password' },
      })
      throw new UnauthorizedException('Invalid credentials')
    }

    if (u.mfaEnabled) {
      const mfaToken = await this.jwt.signAsync({ sub: u.id, mfaChallenge: true }, { expiresIn: '5m' })
      await this.audit.log({
        userId: u.id, action: 'user.login.mfa_challenge', entity: 'user', entityId: u.id,
        ip: ctx.ip, userAgent: ctx.userAgent,
      })
      return { requiresMfa: true, mfaToken }
    }

    return this.completeLogin(u, ctx)
  }

  async loginMfa(mfaToken: string, code: string, ctx: LoginContext = {}): Promise<LoginResponse & { refreshToken: string; refreshExpiresAt: Date }> {
    let payload: MfaChallengePayload
    try {
      payload = await this.jwt.verifyAsync<MfaChallengePayload>(mfaToken)
    } catch {
      throw new UnauthorizedException('MFA challenge expired')
    }
    if (!payload.mfaChallenge) throw new UnauthorizedException('Invalid MFA challenge')
    const u = await this.users.findById(payload.sub)
    if (!u || !u.mfaSecret || !u.mfaEnabled) throw new UnauthorizedException('MFA not configured')
    if (!this.mfa.verifyCode(u.mfaSecret, code)) {
      await this.audit.log({
        userId: u.id, action: 'user.login.mfa_failure', entity: 'user', entityId: u.id,
        ip: ctx.ip, userAgent: ctx.userAgent,
      })
      throw new UnauthorizedException('Invalid MFA code')
    }
    return this.completeLogin(u, ctx)
  }

  async loginSso(userId: string, ctx: LoginContext = {}): Promise<LoginResponse & { refreshToken: string; refreshExpiresAt: Date }> {
    const u = await this.users.findById(userId)
    if (!u) throw new UnauthorizedException('User not found')
    return this.completeLogin(u, ctx)
  }

  async refresh(rawToken: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
    const rotated = await this.tokens.rotateRefreshToken(rawToken)
    if (!rotated) throw new UnauthorizedException('Invalid or expired refresh token')
    return { accessToken: rotated.newAccessToken, refreshToken: rotated.newRefreshToken, expiresAt: rotated.expiresAt }
  }

  async logout(rawToken: string | undefined, userId?: string, ctx: LoginContext = {}): Promise<void> {
    if (rawToken) await this.tokens.revokeRefreshToken(rawToken)
    if (userId) {
      await this.audit.log({
        userId, action: 'user.logout', entity: 'user', entityId: userId,
        ip: ctx.ip, userAgent: ctx.userAgent,
      })
    }
  }

  private async completeLogin(u: { id: string; email: string; name: string; role: { name: string } }, ctx: LoginContext) {
    const accessToken = await this.tokens.issueAccessToken({ sub: u.id, email: u.email, role: u.role.name })
    const refresh = await this.tokens.issueRefreshToken(u.id)
    await this.audit.log({
      userId: u.id, action: 'user.login.success', entity: 'user', entityId: u.id,
      ip: ctx.ip, userAgent: ctx.userAgent,
    })
    return {
      accessToken, refreshToken: refresh.token, refreshExpiresAt: refresh.expiresAt,
      user: { ...this.users.toDto(u), permissions: permissionsFor(u.role.name) },
    }
  }

  // Helper for typed narrowing in controllers
  static isChallenge(result: LoginResult): result is { requiresMfa: true; mfaToken: string } {
    return 'requiresMfa' in result
  }

  static toClientOutcome(result: LoginResult): LoginOutcome {
    if ('requiresMfa' in result) return { requiresMfa: true, mfaToken: result.mfaToken }
    return { accessToken: result.accessToken, user: result.user }
  }
}
