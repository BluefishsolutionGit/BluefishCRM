import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { QuotationsService } from './quotations.service'
import { PdfService } from './pdf.service'
import { QuotationsEmailService } from './quotations-email.service'
import { auditContext } from '../common/request-context'
import type { Request, Response } from 'express'
import type { QuotationDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class CreateQuotationBody {
  @IsString() customerId!: string
  @IsOptional() @IsString() opportunityId?: string
  @IsOptional() @IsString() ownerId?: string
}

class LineBody {
  @IsOptional() @IsString() productId?: string
  @IsString() @MinLength(1) itemName!: string
  @IsOptional() @IsString() description?: string
  @IsInt() @Min(1) quantity!: number
  @IsInt() @Min(0) unitPrice!: number
  @IsOptional() @IsInt() @Min(0) @Max(100) discountPct?: number
}

class CreateVersionBody {
  @IsOptional() @IsInt() @Min(0) @Max(100) discountPct?: number
  @IsOptional() @IsInt() @Min(0) @Max(30) vatPct?: number
  @IsOptional() @IsString() terms?: string
  @IsOptional() @IsString() notes?: string
  @IsArray() @ArrayMinSize(0) @ValidateNested({ each: true }) @Type(() => LineBody)
  lines!: LineBody[]
}

class ApproveBody { @IsOptional() @IsString() comment?: string }
class RejectBody { @IsString() @MinLength(1) comment!: string }
class SendBody {
  @IsOptional() @IsString() toEmail?: string
  @IsOptional() @IsArray() @IsString({ each: true }) ccEmails?: string[]
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('quotations')
export class QuotationsController {
  constructor(
    private quotations: QuotationsService,
    private pdf: PdfService,
    private mailer: QuotationsEmailService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  list(@Req() req: JwtRequest): Promise<QuotationDto[]> {
    return this.quotations.list(req)
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  findOne(@Param('id') id: string, @Req() req: JwtRequest): Promise<QuotationDto> {
    return this.quotations.findOne(id, req)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.QUOTATION_WRITE)
  create(@Body() body: CreateQuotationBody, @Req() req: JwtRequest): Promise<QuotationDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.quotations.create(body, req.user.sub, auditContext(req))
  }

  @Post(':id/versions')
  @RequirePermissions(PERMISSIONS.QUOTATION_WRITE)
  addVersion(@Param('id') id: string, @Body() body: CreateVersionBody, @Req() req: JwtRequest): Promise<QuotationDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.quotations.createVersion(id, body, req.user.sub, auditContext(req))
  }

  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.QUOTATION_WRITE)
  submit(@Param('id') id: string, @Req() req: JwtRequest): Promise<QuotationDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.quotations.submit(id, req.user.sub, auditContext(req))
  }

  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.QUOTATION_APPROVE)
  approve(@Param('id') id: string, @Body() body: ApproveBody, @Req() req: JwtRequest): Promise<QuotationDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.quotations.approve(id, req.user.sub, body.comment, auditContext(req))
  }

  @Post(':id/reject')
  @RequirePermissions(PERMISSIONS.QUOTATION_APPROVE)
  reject(@Param('id') id: string, @Body() body: RejectBody, @Req() req: JwtRequest): Promise<QuotationDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.quotations.reject(id, req.user.sub, body.comment, auditContext(req))
  }

  @Get(':id/pdf')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  async downloadPdf(@Param('id') id: string, @Req() req: JwtRequest, @Res() res: Response): Promise<void> {
    const buf = await this.pdf.renderQuotation(id)
    const q = await this.quotations.findOne(id, req)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${q.no}.pdf"`)
    res.end(buf)
  }

  @Post(':id/send')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.QUOTATION_WRITE)
  async send(@Param('id') id: string, @Body() body: SendBody, @Req() req: JwtRequest): Promise<QuotationDto> {
    if (!req.user) throw new UnauthorizedException()
    await this.mailer.sendQuotation(id, { toEmail: body.toEmail, ccEmails: body.ccEmails })
    await this.quotations.markSent(id, auditContext(req))
    return this.quotations.findOne(id, req)
  }
}
