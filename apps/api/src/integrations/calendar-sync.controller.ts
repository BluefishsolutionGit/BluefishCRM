import { Body, Controller, Get, HttpCode, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { IsEmail, IsIn, IsString } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { CalendarSyncService } from './calendar-sync.service'
import type { Request } from 'express'
import type { CalendarAccountDto, CalendarSyncResultDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class LinkAccountBody {
  @IsIn(['microsoft', 'google']) provider!: 'microsoft' | 'google'
  @IsString() externalId!: string
  @IsEmail() email!: string
  @IsString() accessToken!: string
}

@Controller('integrations/calendar')
@UseGuards(JwtAuthGuard)
export class CalendarSyncController {
  constructor(private sync: CalendarSyncService) {}

  @Get('accounts')
  list(@Req() req: JwtRequest): Promise<CalendarAccountDto[]> {
    if (!req.user) throw new UnauthorizedException()
    return this.sync.list(req.user.sub)
  }

  @Post('accounts/link')
  linkAccount(@Body() body: LinkAccountBody, @Req() req: JwtRequest): Promise<CalendarAccountDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.sync.recordAccount(req.user.sub, body)
  }

  @Post('accounts/:id/sync')
  @HttpCode(200)
  runSync(@Param('id') id: string): Promise<CalendarSyncResultDto> {
    return this.sync.syncAccount(id)
  }
}
