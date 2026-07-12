import { Controller, Get, HttpException, HttpStatus, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import * as ExcelJS from 'exceljs'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { LeadsService } from './leads.service'
import { PrismaService } from '../prisma/prisma.service'
import { auditContext } from '../common/request-context'
import type { Request, Response } from 'express'
import type { ImportResultDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

const COLUMNS: { key: string; header: string; required?: boolean }[] = [
  { key: 'name', header: 'Contact Name', required: true },
  { key: 'companyName', header: 'Company', required: true },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Phone' },
  { key: 'source', header: 'Source', required: true },
  { key: 'estValue', header: 'Est. Value' },
  { key: 'status', header: 'Status' },
  { key: 'ownerEmail', header: 'Owner Email' },
  { key: 'notes', header: 'Notes' },
]
const VALID_STATUSES = ['New', 'Contacted', 'Qualified', 'AI Sourced', 'Converted', 'Lost'] as const
type LeadStatus = (typeof VALID_STATUSES)[number]

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leads')
export class LeadsImportController {
  constructor(private leads: LeadsService, private prisma: PrismaService) {}

  @Get('import-template')
  async downloadTemplate(@Res() res: Response): Promise<void> {
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('leads')
    sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 24 }))
    sheet.getRow(1).font = { bold: true }
    sheet.addRow({
      name: 'Somchai P.', companyName: 'Acme Manufacturing Co., Ltd.',
      email: 'somchai@acme.example', phone: '+66 2 000 0000',
      source: 'Website form', estValue: 500000,
      status: 'New', ownerEmail: 'nattaya@bluefishsolution.com',
      notes: 'Interested in ERP upgrade Q3.',
    })
    const buf = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="leads-import-template.xlsx"')
    res.send(Buffer.from(buf as ArrayBuffer))
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.LEAD_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: JwtRequest): Promise<ImportResultDto> {
    if (!file) throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST)
    if (!req.user) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(file.buffer as unknown as ExcelJS.Buffer)
    const sheet = wb.worksheets[0]
    if (!sheet) throw new HttpException('Empty workbook', HttpStatus.BAD_REQUEST)

    const errors: ImportResultDto['errors'] = []
    let imported = 0, skipped = 0

    const headerRow = sheet.getRow(1)
    const headerMap = new Map<string, number>()
    headerRow.eachCell((cell, colNumber) => {
      const text = String(cell.value ?? '').trim()
      const col = COLUMNS.find((c) => c.header.toLowerCase() === text.toLowerCase())
      if (col) headerMap.set(col.key, colNumber)
    })
    const missing = COLUMNS.filter((c) => c.required && !headerMap.has(c.key))
    if (missing.length > 0) {
      throw new HttpException(`Missing required columns: ${missing.map((c) => c.header).join(', ')}`, HttpStatus.BAD_REQUEST)
    }

    const ownerCache = new Map<string, string>()
    const getOwnerId = async (email: string | null): Promise<string | null> => {
      if (!email) return req.user!.sub
      const norm = email.toLowerCase().trim()
      if (ownerCache.has(norm)) return ownerCache.get(norm)!
      const u = await this.prisma.user.findUnique({ where: { email: norm } })
      if (!u) return null
      ownerCache.set(norm, u.id)
      return u.id
    }

    const ctx = auditContext(req)

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const value = (key: string): string => {
        const col = headerMap.get(key)
        if (!col) return ''
        return String(row.getCell(col).value ?? '').trim()
      }
      const numValue = (key: string): number | undefined => {
        const v = value(key)
        if (!v) return undefined
        const n = Number(v.replace(/,/g, ''))
        return Number.isFinite(n) ? n : undefined
      }

      const name = value('name')
      if (!name) { skipped++; continue }

      for (const c of COLUMNS) {
        if (c.required && !value(c.key)) errors.push({ row: r, field: c.key, message: `${c.header} is required` })
      }
      if (errors.some((e) => e.row === r)) { skipped++; continue }

      const ownerEmail = value('ownerEmail')
      const ownerId = await getOwnerId(ownerEmail || null)
      if (ownerEmail && !ownerId) {
        errors.push({ row: r, field: 'ownerEmail', message: `Unknown owner "${ownerEmail}"` })
        skipped++; continue
      }

      const status = value('status') || 'New'
      if (!(VALID_STATUSES as readonly string[]).includes(status)) {
        errors.push({ row: r, field: 'status', message: `Invalid status "${status}"` })
        skipped++; continue
      }

      try {
        await this.leads.create({
          name,
          companyName: value('companyName'),
          email: value('email') || undefined,
          phone: value('phone') || undefined,
          source: value('source'),
          estValue: numValue('estValue'),
          status: status as LeadStatus,
          ownerId,
          notes: value('notes') || undefined,
        }, ctx)
        imported++
      } catch (e) {
        errors.push({ row: r, message: e instanceof Error ? e.message : 'Create failed' })
        skipped++
      }
    }

    return { imported, skipped, errors }
  }
}
