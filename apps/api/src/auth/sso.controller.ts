import { Controller, Get, Query, Req, Res, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { SsoService } from './sso.service'
import { AuthService } from './auth.service'
import { clientIp } from '../common/request-context'
import { AuditService } from '../audit/audit.service'
import type { Request, Response } from 'express'

const STATE_COOKIE = 'bluefish_sso_state'
const REFRESH_COOKIE = 'bluefish_refresh'

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/api/auth',
  })
}

@Controller('auth/sso')
export class SsoController {
  constructor(private sso: SsoService, private auth: AuthService, private cfg: ConfigService, private audit: AuditService) {}

  @Get('microsoft')
  microsoft(@Res({ passthrough: true }) res: Response) {
    if (!this.sso.isConfigured()) {
      throw new ServiceUnavailableException('Microsoft SSO is not configured. Add MICROSOFT_CLIENT_ID/SECRET/TENANT_ID to apps/api/.env')
    }
    const state = crypto.randomBytes(16).toString('base64url')
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true, sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 5 * 60 * 1000, path: '/api/auth/sso',
    })
    return res.redirect(this.sso.authorizeUrl(state))
  }

  @Get('microsoft/callback')
  async microsoftCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const webBase = this.cfg.get<string>('WEB_BASE_URL') ?? 'http://localhost:5173'
    if (error || !code) {
      return res.redirect(`${webBase}/login?sso_error=${encodeURIComponent(error ?? 'missing_code')}`)
    }
    const cookies = req.cookies as Record<string, string> | undefined
    const expectedState = cookies?.[STATE_COOKIE]
    if (!expectedState || expectedState !== state) {
      return res.redirect(`${webBase}/login?sso_error=state_mismatch`)
    }
    res.clearCookie(STATE_COOKIE, { path: '/api/auth/sso' })

    try {
      const profile = await this.sso.exchangeCode(code)
      const userId = await this.sso.findOrLinkUser(profile)
      const result = await this.auth.loginSso(userId, {
        ip: clientIp(req), userAgent: req.headers['user-agent'] ?? null,
      })
      await this.audit.log({
        userId, action: 'user.sso.microsoft', entity: 'user', entityId: userId,
        ip: clientIp(req), userAgent: req.headers['user-agent'] ?? null,
        metadata: { email: profile.email },
      })
      setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt)
      // Redirect to a bridge page that reads the access token from URL fragment and stores it
      const fragment = new URLSearchParams({ token: result.accessToken }).toString()
      return res.redirect(`${webBase}/login#${fragment}`)
    } catch (e) {
      const msg = e instanceof UnauthorizedException ? e.message : 'sso_failed'
      return res.redirect(`${webBase}/login?sso_error=${encodeURIComponent(msg)}`)
    }
  }
}
