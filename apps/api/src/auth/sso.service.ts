import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'

export interface MicrosoftProfile {
  oid: string
  email: string
  name: string
}

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name)

  constructor(private prisma: PrismaService, private cfg: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.cfg.get<string>('MICROSOFT_CLIENT_ID') &&
        this.cfg.get<string>('MICROSOFT_CLIENT_SECRET') &&
        this.cfg.get<string>('MICROSOFT_TENANT_ID'),
    )
  }

  authorizeUrl(state: string): string {
    const clientId = this.cfg.get<string>('MICROSOFT_CLIENT_ID')!
    const tenant = this.cfg.get<string>('MICROSOFT_TENANT_ID')!
    const redirect = this.cfg.get<string>('MICROSOFT_REDIRECT_URI') ?? 'http://localhost:4000/api/auth/sso/microsoft/callback'
    const scope = 'openid profile email User.Read'
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirect,
      response_mode: 'query',
      scope,
      state,
      prompt: 'select_account',
    })
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`
  }

  async exchangeCode(code: string): Promise<MicrosoftProfile> {
    const clientId = this.cfg.get<string>('MICROSOFT_CLIENT_ID')!
    const clientSecret = this.cfg.get<string>('MICROSOFT_CLIENT_SECRET')!
    const tenant = this.cfg.get<string>('MICROSOFT_TENANT_ID')!
    const redirect = this.cfg.get<string>('MICROSOFT_REDIRECT_URI') ?? 'http://localhost:4000/api/auth/sso/microsoft/callback'

    const body = new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      grant_type: 'authorization_code', code, redirect_uri: redirect, scope: 'openid profile email User.Read',
    })
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    })
    if (!tokenRes.ok) {
      this.logger.error(`Microsoft token exchange failed: ${tokenRes.status}`)
      throw new UnauthorizedException('Microsoft sign-in failed')
    }
    const tokens = (await tokenRes.json()) as { access_token?: string; id_token?: string }
    if (!tokens.id_token) throw new UnauthorizedException('No id_token from Microsoft')

    const payload = this.decodeJwtPayload(tokens.id_token)
    const email = (payload.email ?? payload.preferred_username ?? payload.upn) as string | undefined
    const name = (payload.name ?? email ?? 'Unknown') as string
    const oid = payload.oid as string | undefined
    if (!email || !oid) throw new UnauthorizedException('Missing profile fields from Microsoft')

    return { oid, email: email.toLowerCase(), name }
  }

  async findOrLinkUser(profile: MicrosoftProfile): Promise<string> {
    const allowedDomains = (this.cfg.get<string>('MICROSOFT_ALLOWED_DOMAINS') ?? '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (allowedDomains.length > 0) {
      const domain = profile.email.split('@')[1]
      if (!allowedDomains.includes(domain)) {
        throw new UnauthorizedException(`Email domain "${domain}" is not allowed`)
      }
    }

    const existingLink = await this.prisma.authProvider.findUnique({
      where: { provider_providerId: { provider: 'microsoft', providerId: profile.oid } },
      include: { user: true },
    })
    if (existingLink) return existingLink.userId

    const existingUser = await this.prisma.user.findUnique({ where: { email: profile.email } })
    if (existingUser) {
      await this.prisma.authProvider.create({
        data: { userId: existingUser.id, provider: 'microsoft', providerId: profile.oid, email: profile.email },
      })
      return existingUser.id
    }

    // Auto-provision new user with sales_rep role
    const role = await this.prisma.role.findUnique({ where: { name: 'sales_rep' } })
    if (!role) throw new Error('sales_rep role missing — run seed first')

    const randomPassword = crypto.randomBytes(24).toString('base64url')
    const passwordHash = await import('bcryptjs').then((b) => b.hash(randomPassword, 10))

    const user = await this.prisma.user.create({
      data: { email: profile.email, name: profile.name, passwordHash, roleId: role.id },
    })
    await this.prisma.authProvider.create({
      data: { userId: user.id, provider: 'microsoft', providerId: profile.oid, email: profile.email },
    })
    return user.id
  }

  private decodeJwtPayload(jwt: string): Record<string, unknown> {
    const parts = jwt.split('.')
    if (parts.length !== 3) throw new UnauthorizedException('Malformed id_token')
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8')
    return JSON.parse(payload) as Record<string, unknown>
  }
}
