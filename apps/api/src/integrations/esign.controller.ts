import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { IsEmail, IsString, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { EsignService } from './esign.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { EnvelopeDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class SendBody {
  @IsEmail() signerEmail!: string
  @IsString() @MinLength(1) signerName!: string
}

@Controller('esign')
export class EsignController {
  constructor(private esign: EsignService) {}

  @Get('contracts/:contractId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.CONTRACT_READ)
  list(@Param('contractId') contractId: string): Promise<EnvelopeDto[]> {
    return this.esign.listForContract(contractId)
  }

  @Post('contracts/:contractId/send')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.CONTRACT_WRITE)
  send(@Param('contractId') contractId: string, @Body() body: SendBody, @Req() req: JwtRequest): Promise<EnvelopeDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.esign.sendForSignature(contractId, body, req.user.sub, auditContext(req))
  }

  /** Public callback URL invoked when the signer clicks "sign here" and completes. */
  @Post('envelopes/:externalId/callback')
  @HttpCode(200)
  callback(@Param('externalId') externalId: string, @Query('token') token: string): Promise<{ contractId: string; status: string }> {
    return this.esign.recordSignature(externalId, token ?? '')
  }
}
