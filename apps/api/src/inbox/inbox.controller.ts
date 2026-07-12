import { Body, Controller, Get, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { InboxService } from './inbox.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { InboxMessageDto, InboxThreadDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class SendMessageBody {
  @IsString() @MinLength(1) text!: string
}
class AssignBody {
  @IsOptional() @IsString() ownerId?: string
}
class LinkBody {
  @IsString() customerId!: string
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inbox')
export class InboxController {
  constructor(private inbox: InboxService) {}

  @Get('threads')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  listThreads(): Promise<InboxThreadDto[]> {
    return this.inbox.listThreads()
  }

  @Get('threads/:id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  getThread(@Param('id') id: string): Promise<InboxThreadDto> {
    return this.inbox.getThread(id)
  }

  @Get('threads/:id/messages')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  listMessages(@Param('id') id: string): Promise<InboxMessageDto[]> {
    return this.inbox.listMessages(id)
  }

  @Post('threads/:id/messages')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  send(@Param('id') id: string, @Body() body: SendMessageBody, @Req() req: JwtRequest): Promise<InboxMessageDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.inbox.sendReply(id, body.text, req.user.sub, auditContext(req))
  }

  @Patch('threads/:id/read')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  markRead(@Param('id') id: string): Promise<InboxThreadDto> {
    return this.inbox.markRead(id)
  }

  @Patch('threads/:id/assign')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  assign(@Param('id') id: string, @Body() body: AssignBody, @Req() req: JwtRequest): Promise<InboxThreadDto> {
    return this.inbox.assign(id, body.ownerId ?? null, auditContext(req))
  }

  @Patch('threads/:id/link')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  link(@Param('id') id: string, @Body() body: LinkBody, @Req() req: JwtRequest): Promise<InboxThreadDto> {
    return this.inbox.link(id, body.customerId, auditContext(req))
  }
}
