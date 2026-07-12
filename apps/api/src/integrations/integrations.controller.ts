import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUrl, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { ApiKeysService } from './api-keys.service'
import { WebhooksService } from './webhooks.service'
import { PushService } from './push.service'
import type { Request } from 'express'
import type { ApiKeyDto, CreatedApiKeyDto, PushSubscribeDto, WebhookSubscriptionDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

const AVAILABLE_SCOPES = ['customers:read', 'customers:write', 'leads:read', 'leads:write', 'opportunities:read', 'contracts:read', 'reports:read']
const AVAILABLE_EVENTS = ['*', 'lead.created', 'lead.converted', 'opportunity.stage_change', 'quotation.approved', 'contract.signed', 'inbox.message.in']

class CreateApiKeyBody {
  @IsString() @MinLength(2) name!: string
  @IsArray() @IsString({ each: true }) scopes!: string[]
}
class CreateWebhookBody {
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] }) url!: string
  @IsArray() @ArrayMinSize(1) @IsIn(AVAILABLE_EVENTS, { each: true }) events!: string[]
}
class PushKeys { @IsString() p256dh!: string; @IsString() auth!: string }
class SubscribePushBody {
  @IsString() endpoint!: string
  @ValidateNested() @Type(() => PushKeys) keys!: PushKeys
  @IsOptional() @IsString() userAgent?: string
}
class UnsubscribePushBody { @IsString() endpoint!: string }
class TestPushBody { @IsString() @MinLength(1) title!: string; @IsString() @MinLength(1) body!: string }

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class IntegrationsController {
  constructor(private apiKeys: ApiKeysService, private webhooks: WebhooksService, private push: PushService) {}

  // ─── API keys ───
  @Get('integrations/api-keys')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  listApiKeys(): Promise<ApiKeyDto[]> {
    return this.apiKeys.list()
  }

  @Post('integrations/api-keys')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  createApiKey(@Body() body: CreateApiKeyBody, @Req() req: JwtRequest): Promise<CreatedApiKeyDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.apiKeys.create(body, req.user.sub)
  }

  @Delete('integrations/api-keys/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async revokeApiKey(@Param('id') id: string): Promise<void> {
    await this.apiKeys.revoke(id)
  }

  @Get('integrations/api-keys/available-scopes')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  scopes(): string[] { return AVAILABLE_SCOPES }

  // ─── Outbound webhooks ───
  @Get('integrations/webhooks')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  listWebhooks(): Promise<WebhookSubscriptionDto[]> {
    return this.webhooks.list()
  }

  @Post('integrations/webhooks')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  createWebhook(@Body() body: CreateWebhookBody, @Req() req: JwtRequest): Promise<WebhookSubscriptionDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.webhooks.create(body, req.user.sub)
  }

  @Delete('integrations/webhooks/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async deleteWebhook(@Param('id') id: string): Promise<void> {
    await this.webhooks.delete(id)
  }

  @Get('integrations/webhooks/available-events')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  events(): string[] { return AVAILABLE_EVENTS }

  // ─── Web Push ───
  @Get('integrations/push/public-key')
  publicKey(): { publicKey: string | null } {
    return { publicKey: this.push.publicVapidKey() }
  }

  @Post('integrations/push/subscribe')
  async subscribe(@Body() body: SubscribePushBody, @Req() req: JwtRequest): Promise<{ id: string }> {
    if (!req.user) throw new UnauthorizedException()
    return this.push.subscribe(req.user.sub, body as PushSubscribeDto)
  }

  @Post('integrations/push/unsubscribe')
  @HttpCode(204)
  async unsubscribe(@Body() body: UnsubscribePushBody, @Req() req: JwtRequest): Promise<void> {
    if (!req.user) throw new UnauthorizedException()
    await this.push.unsubscribe(req.user.sub, body.endpoint)
  }

  @Post('integrations/push/test')
  @HttpCode(200)
  async testPush(@Body() body: TestPushBody, @Req() req: JwtRequest): Promise<{ sent: number; skipped: number }> {
    if (!req.user) throw new UnauthorizedException()
    return this.push.notifyUser(req.user.sub, { title: body.title, body: body.body })
  }
}
