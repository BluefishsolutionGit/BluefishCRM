import { Body, Controller, HttpCode, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { IsString, Length } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { MfaService } from '../auth/mfa.service'
import { AuditService } from '../audit/audit.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class VerifyBody { @IsString() @Length(6, 6) code!: string }

@UseGuards(JwtAuthGuard)
@Controller('users/me/mfa')
export class MfaController {
  constructor(private mfa: MfaService, private audit: AuditService) {}

  @Post('setup')
  async setup(@Req() req: JwtRequest): Promise<{ secret: string; otpauth: string }> {
    const id = req.user?.sub
    if (!id) throw new UnauthorizedException()
    await this.audit.log({ ...auditContext(req), action: 'user.mfa.setup', entity: 'user', entityId: id })
    return this.mfa.initSetup(id)
  }

  @Post('verify')
  @HttpCode(204)
  async verify(@Body() body: VerifyBody, @Req() req: JwtRequest): Promise<void> {
    const id = req.user?.sub
    if (!id) throw new UnauthorizedException()
    await this.mfa.verifyAndEnable(id, body.code)
    await this.audit.log({ ...auditContext(req), action: 'user.mfa.enable', entity: 'user', entityId: id })
  }

  @Post('disable')
  @HttpCode(204)
  async disable(@Body() body: VerifyBody, @Req() req: JwtRequest): Promise<void> {
    const id = req.user?.sub
    if (!id) throw new UnauthorizedException()
    await this.mfa.disable(id, body.code)
    await this.audit.log({ ...auditContext(req), action: 'user.mfa.disable', entity: 'user', entityId: id })
  }
}
