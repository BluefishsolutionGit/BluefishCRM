import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { IsEmail, IsString, Length, MinLength } from 'class-validator'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './jwt.guard'
import { clientIp } from '../common/request-context'
import type { Request, Response } from 'express'
import type { LoginOutcome } from '@bluefish/shared'

const REFRESH_COOKIE = 'bluefish_refresh'

class LoginDto {
  @IsEmail() email!: string
  @IsString() @MinLength(6) password!: string
}
class LoginMfaDto {
  @IsString() mfaToken!: string
  @IsString() @Length(6, 6) code!: string
}

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/api/auth',
  })
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginOutcome> {
    const result = await this.auth.login(dto.email, dto.password, {
      ip: clientIp(req), userAgent: req.headers['user-agent'] ?? null,
    })
    if (AuthService.isChallenge(result)) return { requiresMfa: true, mfaToken: result.mfaToken }
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt)
    return { accessToken: result.accessToken, user: result.user }
  }

  @Post('login/mfa')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async loginMfa(@Body() dto: LoginMfaDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginOutcome> {
    const result = await this.auth.loginMfa(dto.mfaToken, dto.code, {
      ip: clientIp(req), userAgent: req.headers['user-agent'] ?? null,
    })
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt)
    return { accessToken: result.accessToken, user: result.user }
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ accessToken: string }> {
    const cookies = req.cookies as Record<string, string> | undefined
    const token = cookies?.[REFRESH_COOKIE]
    if (!token) throw new UnauthorizedException('No refresh token')
    const result = await this.auth.refresh(token)
    setRefreshCookie(res, result.refreshToken, result.expiresAt)
    return { accessToken: result.accessToken }
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: JwtRequest, @Res({ passthrough: true }) res: Response): Promise<void> {
    const cookies = req.cookies as Record<string, string> | undefined
    const token = cookies?.[REFRESH_COOKIE]
    await this.auth.logout(token, req.user?.sub, { ip: clientIp(req), userAgent: req.headers['user-agent'] ?? null })
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
  }
}
