import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { IsEmail, IsOptional, IsString } from 'class-validator'
import type { Request, Response } from 'express'
import { WebAuthnService } from './webauthn.service'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './jwt.guard'
import { TokensService } from './tokens.service'
import { Res } from '@nestjs/common'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class RegBody {
  @IsOptional() @IsString() deviceLabel?: string
  response!: unknown
}
class AuthOptsBody { @IsEmail() email!: string }
class AuthFinBody {
  @IsEmail() email!: string
  response!: unknown
}

@Controller('auth/webauthn')
export class WebAuthnController {
  constructor(private webauthn: WebAuthnService, private auth: AuthService, private tokens: TokensService) {}

  // ─── Registration (requires an authenticated session) ─────────
  @UseGuards(JwtAuthGuard)
  @Post('register/options')
  async regOptions(@Req() req: JwtRequest) {
    if (!req.user) throw new UnauthorizedException()
    return this.webauthn.beginRegistration(req.user.sub)
  }

  @UseGuards(JwtAuthGuard)
  @Post('register/verify')
  async regVerify(@Body() body: RegBody, @Req() req: JwtRequest) {
    if (!req.user) throw new UnauthorizedException()
    return this.webauthn.finishRegistration(req.user.sub, body.response as never, body.deviceLabel)
  }

  @UseGuards(JwtAuthGuard)
  @Get('credentials')
  async listCredentials(@Req() req: JwtRequest) {
    if (!req.user) throw new UnauthorizedException()
    return this.webauthn.listCredentials(req.user.sub)
  }

  @UseGuards(JwtAuthGuard)
  @Delete('credentials/:id')
  @HttpCode(204)
  async removeCredential(@Param('id') id: string, @Req() req: JwtRequest): Promise<void> {
    if (!req.user) throw new UnauthorizedException()
    await this.webauthn.deleteCredential(req.user.sub, id)
  }

  // ─── Authentication (no session required) ─────────────────────
  @Post('authenticate/options')
  async authOptions(@Body() body: AuthOptsBody) {
    return this.webauthn.beginAuthentication(body.email)
  }

  @Post('authenticate/verify')
  async authVerify(@Body() body: AuthFinBody, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { userId } = await this.webauthn.finishAuthentication(body.email, body.response as never)
    const result = await this.auth.loginByUserId(userId, {
      ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ?? req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] ?? null,
    })
    // Refresh-token cookie mirrors the regular login path
    res.cookie('bluefish_refresh', result.refreshToken, {
      httpOnly: true, sameSite: 'lax', secure: false,
      expires: result.refreshExpiresAt, path: '/',
    })
    return { accessToken: result.accessToken, user: result.user }
  }
}
