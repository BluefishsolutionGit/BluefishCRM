import { Body, Controller, Delete, Get, Param, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { ChannelIntegrationsService } from './channel-integrations.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { ChannelIntegrationDto, ChannelIntegrationType } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class UpsertBody {
  @IsOptional() @IsString() label?: string
  @IsObject() values!: Record<string, string>
  @IsOptional() @IsBoolean() isActive?: boolean
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('integrations/channels')
export class ChannelIntegrationsController {
  constructor(private channels: ChannelIntegrationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  list(): Promise<ChannelIntegrationDto[]> {
    return this.channels.list()
  }

  @Get(':channel')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  get(@Param('channel') channel: string): Promise<ChannelIntegrationDto> {
    return this.channels.get(channel as ChannelIntegrationType)
  }

  @Put(':channel')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  upsert(@Param('channel') channel: string, @Body() body: UpsertBody, @Req() req: JwtRequest): Promise<ChannelIntegrationDto> {
    if (!req.user) throw new UnauthorizedException()
    const ctx = { ...auditContext(req), userId: req.user.sub }
    return this.channels.upsert(channel as ChannelIntegrationType, body, ctx)
  }

  @Delete(':channel')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async remove(@Param('channel') channel: string, @Req() req: JwtRequest): Promise<{ ok: true }> {
    if (!req.user) throw new UnauthorizedException()
    const ctx = { ...auditContext(req), userId: req.user.sub }
    await this.channels.remove(channel as ChannelIntegrationType, ctx)
    return { ok: true }
  }
}
