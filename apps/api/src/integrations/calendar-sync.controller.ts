import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IsEmail, IsIn, IsString } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { CalendarSyncService } from './calendar-sync.service'
import type { Request, Response } from 'express'
import type { CalendarAccountDto, CalendarSyncResultDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class LinkAccountBody {
  @IsIn(['microsoft', 'google']) provider!: 'microsoft' | 'google'
  @IsString() externalId!: string
  @IsEmail() email!: string
  @IsString() accessToken!: string
}

@Controller('integrations/calendar')
export class CalendarSyncController {
  constructor(private sync: CalendarSyncService, private cfg: ConfigService) {}

  /** Public — the login screen and Settings both need to know whether OAuth is wired up. */
  @Get('microsoft/status')
  microsoftStatus(): { configured: boolean } {
    return { configured: this.sync.isConfigured() }
  }

  /**
   * Authenticated. Returns the Microsoft authorize URL to which the frontend should
   * redirect the browser. We don't 302 from here directly because that would require
   * the JWT to travel via cookie/query rather than Authorization header.
   */
  @Post('microsoft/authorize-url')
  @UseGuards(JwtAuthGuard)
  authorizeUrl(@Req() req: JwtRequest): { url: string } {
    if (!req.user) throw new UnauthorizedException()
    return { url: this.sync.authorizeUrl(req.user.sub) }
  }

  /**
   * Public — Microsoft redirects the browser here after consent. We look up the user
   * that started the flow via the `state` we handed out at /authorize-url, then link
   * the account and bounce back to the Settings page with a status flag.
   */
  @Get('microsoft/callback')
  async microsoftCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const webBase = this.cfg.get<string>('WEB_BASE_URL') ?? 'http://localhost:5173'
    const back = (params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString()
      return res.redirect(`${webBase}/settings?${qs}`)
    }
    if (error) return back({ calendar: 'error', reason: errorDescription ?? error })
    if (!code || !state) return back({ calendar: 'error', reason: 'missing_code_or_state' })

    try {
      const account = await this.sync.handleCallback(code, state)
      return back({ calendar: 'connected', email: account.email })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown_error'
      return back({ calendar: 'error', reason: msg })
    }
  }

  @Get('accounts')
  @UseGuards(JwtAuthGuard)
  list(@Req() req: JwtRequest): Promise<CalendarAccountDto[]> {
    if (!req.user) throw new UnauthorizedException()
    return this.sync.list(req.user.sub)
  }

  /**
   * Dev-only escape hatch: lets the frontend register a stub account when Microsoft
   * OAuth isn't configured, so the sync flow can be exercised end-to-end without
   * real M365 credentials. Real linking now goes through /microsoft/connect + callback.
   */
  @Post('accounts/link')
  @UseGuards(JwtAuthGuard)
  linkAccount(@Body() body: LinkAccountBody, @Req() req: JwtRequest): Promise<CalendarAccountDto> {
    if (!req.user) throw new UnauthorizedException()
    if (!body.accessToken.startsWith('dev_stub')) {
      // Prevent misuse: real tokens must come from the OAuth callback.
      throw new BadRequestException('Use /microsoft/authorize-url for real Microsoft accounts')
    }
    return this.sync.recordAccount(req.user.sub, body)
  }

  @Post('accounts/:id/sync')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  runSync(@Param('id') id: string, @Req() req: JwtRequest): Promise<CalendarSyncResultDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.sync.syncAccount(req.user.sub, id)
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async disconnect(@Param('id') id: string, @Req() req: JwtRequest): Promise<void> {
    if (!req.user) throw new UnauthorizedException()
    await this.sync.disconnect(req.user.sub, id)
  }

  /**
   * Graph change-notification receiver. Two shapes:
   *  1. Subscription validation — Microsoft POSTs ?validationToken=<random> once when the
   *     subscription is created. We must echo the token as plain text within 10 s.
   *  2. Real notifications — { value: [{ subscriptionId, clientState, resource, ... }] }.
   *     We ack quickly (< 30 s) and trigger a delta sync per matched account.
   */
  @Post('microsoft/notifications')
  @HttpCode(202)
  @Header('Content-Type', 'text/plain')
  async notifications(
    @Query('validationToken') validationToken: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    if (validationToken) {
      // Echo verbatim — text/plain, 200 OK.
      res.status(200)
      return validationToken
    }
    const items = (body as { value?: Array<{ subscriptionId?: string; clientState?: string }> })?.value ?? []
    // Fire-and-forget so Microsoft gets a fast 202 — never let per-account errors bubble up.
    for (const n of items) {
      void this.sync.handleNotification(n).catch(() => undefined)
    }
    return ''
  }
}
