import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { DocumentsService } from './documents.service'
import { auditContext } from '../common/request-context'
import type { Request, Response } from 'express'
import type { DocumentDto, DocumentCategory } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  list(
    @Query('customerId') customerId?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('quotationId') quotationId?: string,
    @Query('category') category?: string,
  ): Promise<DocumentDto[]> {
    return this.documents.list({ customerId, opportunityId, quotationId, category })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  findOne(@Param('id') id: string): Promise<DocumentDto> {
    return this.documents.findOne(id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('name') name: string | undefined,
    @Body('customerId') customerId: string | undefined,
    @Body('opportunityId') opportunityId: string | undefined,
    @Body('quotationId') quotationId: string | undefined,
    @Body('category') category: DocumentCategory | undefined,
    @Req() req: JwtRequest,
  ): Promise<DocumentDto> {
    if (!file) throw new BadRequestException('No file uploaded')
    if (!req.user) throw new UnauthorizedException()
    return this.documents.upload(
      { name, customerId, opportunityId, quotationId, category, file: { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype } },
      req.user.sub,
      auditContext(req),
    )
  }

  @Post(':id/versions')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  async newVersion(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: JwtRequest,
  ): Promise<DocumentDto> {
    if (!file) throw new BadRequestException('No file uploaded')
    if (!req.user) throw new UnauthorizedException()
    return this.documents.uploadNewVersion(id, { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype }, req.user.sub, auditContext(req))
  }

  @Get('versions/:versionId/download')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  async download(@Param('versionId') versionId: string, @Res() res: Response): Promise<void> {
    const { buffer, filename, mimeType } = await this.documents.getVersionForDownload(versionId)
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    res.end(buffer)
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  async delete(@Param('id') id: string, @Req() req: JwtRequest): Promise<void> {
    await this.documents.delete(id, auditContext(req))
  }
}
