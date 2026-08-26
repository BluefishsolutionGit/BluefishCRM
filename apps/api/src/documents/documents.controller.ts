import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { DocumentsService } from './documents.service'
import { auditContext } from '../common/request-context'
import type { Request, Response } from 'express'
import { SERVICE_LINES, type ServiceLine } from '@bluefish/shared'
import type { DocumentDto, DocumentCategory } from '@bluefish/shared'

const CATEGORIES = [
  'contract', 'amendment', 'addendum', 'appendix', 'sow', 'nda',
  'po', 'invoice', 'receipt', 'quotation', 'tor', 'boq', 'certificate',
  'brochure', 'other',
] as const

class CreateLinkBody {
  @IsString() @MinLength(1) name!: string
  @IsString() @MinLength(1) url!: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsIn(CATEGORIES as readonly string[]) category?: DocumentCategory
  @IsOptional() @IsString() customerId?: string
  @IsOptional() @IsString() opportunityId?: string
  @IsOptional() @IsString() quotationId?: string
  @IsOptional() @IsString() contractId?: string
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_LINES as readonly string[], { each: true }) serviceLines?: ServiceLine[]
  @IsOptional() @IsBoolean() isCentral?: boolean
}

class UpdateDocumentBody {
  @IsOptional() @IsString() @MinLength(1) name?: string
  @IsOptional() @IsString() description?: string | null
  @IsOptional() @IsIn(CATEGORIES as readonly string[]) category?: DocumentCategory
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_LINES as readonly string[], { each: true }) serviceLines?: ServiceLine[]
  @IsOptional() @IsBoolean() isCentral?: boolean
}

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  list(
    @Req() req: JwtRequest,
    @Query('customerId') customerId?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('quotationId') quotationId?: string,
    @Query('contractId') contractId?: string,
    @Query('category') category?: string,
    @Query('service') service?: string,
    @Query('isCentral') isCentralRaw?: string,
    @Query('q') q?: string,
  ): Promise<DocumentDto[]> {
    const isCentral = isCentralRaw === 'true' ? true : isCentralRaw === 'false' ? false : undefined
    return this.documents.list(req, { customerId, opportunityId, quotationId, contractId, category, service, isCentral, q })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  findOne(@Param('id') id: string, @Req() req: JwtRequest): Promise<DocumentDto> {
    return this.documents.findOne(id, req)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('name') name: string | undefined,
    @Body('description') description: string | undefined,
    @Body('customerId') customerId: string | undefined,
    @Body('opportunityId') opportunityId: string | undefined,
    @Body('quotationId') quotationId: string | undefined,
    @Body('contractId') contractId: string | undefined,
    @Body('category') category: DocumentCategory | undefined,
    @Body('serviceLines') serviceLinesRaw: string | string[] | undefined,
    @Body('isCentral') isCentralRaw: string | undefined,
    @Body('versionNotes') versionNotes: string | undefined,
    @Req() req: JwtRequest,
  ): Promise<DocumentDto> {
    if (!file) throw new BadRequestException('No file uploaded')
    if (!req.user) throw new UnauthorizedException()
    const serviceLines = parseServiceLines(serviceLinesRaw)
    const isCentral = isCentralRaw === 'true' ? true : isCentralRaw === 'false' ? false : undefined
    return this.documents.upload(
      { name, description, customerId, opportunityId, quotationId, contractId, category,
        serviceLines, isCentral, versionNotes,
        file: { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype } },
      req.user.sub,
      auditContext(req),
    )
  }

  @Post('link')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  async createLink(@Body() body: CreateLinkBody, @Req() req: JwtRequest): Promise<DocumentDto> {
    if (!req.user) throw new UnauthorizedException()
    return this.documents.createLink(body, req.user.sub, auditContext(req))
  }

  @Post(':id/versions')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  async newVersion(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('notes') notes: string | undefined,
    @Req() req: JwtRequest,
  ): Promise<DocumentDto> {
    if (!file) throw new BadRequestException('No file uploaded')
    if (!req.user) throw new UnauthorizedException()
    return this.documents.uploadNewVersion(id, { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype }, req.user.sub, auditContext(req), { notes })
  }

  @Post(':id/versions/:versionId/make-current')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  makeCurrent(@Param('id') id: string, @Param('versionId') versionId: string, @Req() req: JwtRequest): Promise<DocumentDto> {
    return this.documents.setCurrentVersion(id, versionId, auditContext(req))
  }

  @Delete(':id/versions/:versionId')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  deleteVersion(@Param('id') id: string, @Param('versionId') versionId: string, @Req() req: JwtRequest): Promise<DocumentDto> {
    return this.documents.deleteVersion(id, versionId, auditContext(req))
  }

  @Get('versions/:versionId/download')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  async download(@Param('versionId') versionId: string, @Req() req: JwtRequest, @Res() res: Response): Promise<void> {
    const { buffer, filename, mimeType } = await this.documents.getVersionForDownload(versionId, req)
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    res.end(buffer)
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  update(@Param('id') id: string, @Body() body: UpdateDocumentBody, @Req() req: JwtRequest): Promise<DocumentDto> {
    return this.documents.update(id, body, auditContext(req))
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  async delete(@Param('id') id: string, @Req() req: JwtRequest): Promise<void> {
    await this.documents.delete(id, auditContext(req))
  }
}

function parseServiceLines(v: string | string[] | undefined): ServiceLine[] | undefined {
  if (v === undefined) return undefined
  const arr = Array.isArray(v) ? v : v.split(',')
  const clean = arr.map((s) => s.trim()).filter(Boolean)
  const valid = clean.filter((s) => (SERVICE_LINES as readonly string[]).includes(s)) as ServiceLine[]
  return valid.length ? valid : []
}
