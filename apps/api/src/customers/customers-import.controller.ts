import { Controller, Get, HttpException, HttpStatus, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import * as ExcelJS from 'exceljs'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { CustomersService } from './customers.service'
import { PrismaService } from '../prisma/prisma.service'
import { auditContext } from '../common/request-context'
import type { Request, Response } from 'express'
import type { ImportResultDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

const COLUMNS: { key: string; header: string; required?: boolean }[] = [
  { key: 'code', header: 'Code', required: true },
  { key: 'name', header: 'Name', required: true },
  { key: 'nameTh', header: 'Name (TH)' },
  { key: 'industry', header: 'Industry', required: true },
  { key: 'status', header: 'Status' },
  { key: 'ownerEmail', header: 'Owner Email', required: true },
  { key: 'city', header: 'City', required: true },
  { key: 'address', header: 'Address', required: true },
  { key: 'taxId', header: 'Tax ID', required: true },
  { key: 'phone', header: 'Phone', required: true },
  { key: 'terms', header: 'Terms' },
  { key: 'openValue', header: 'Open Value' },
]

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('customers')
export class CustomersImportController {
  constructor(private customers: CustomersService, private prisma: PrismaService) {}

  @Get('import-template')
  async downloadTemplate(@Res() res: Response): Promise<void> {
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('customers')
    sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 24 }))
    sheet.getRow(1).font = { bold: true }
    sheet.addRow({
      code: 'C-9001', name: 'Example Co., Ltd.', nameTh: 'บจก. ตัวอย่าง',
      industry: 'Manufacturing', status: 'Prospect',
      ownerEmail: 'nattaya@bluefishsolution.com',
      city: 'Bangkok', address: '123 Sample Rd.',
      taxId: '0105501234567', phone: '+66 2 000 0000',
      terms: 'Net 30', openValue: 500000,
    })
    const buf = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="customers-import-template.xlsx"')
    res.send(Buffer.from(buf as ArrayBuffer))
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: JwtRequest): Promise<ImportResultDto> {
    if (!file) throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(file.buffer as unknown as ExcelJS.Buffer)
    const sheet = wb.worksheets[0]
    if (!sheet) throw new HttpException('Empty workbook', HttpStatus.BAD_REQUEST)

    const errors: ImportResultDto['errors'] = []
    let imported = 0
    let skipped = 0

    const headerRow = sheet.getRow(1)
    const headerMap = new Map<string, number>()
    headerRow.eachCell((cell, colNumber) => {
      const text = String(cell.value ?? '').trim()
      const col = COLUMNS.find((c) => c.header.toLowerCase() === text.toLowerCase())
      if (col) headerMap.set(col.key, colNumber)
    })

    const missingHeaders = COLUMNS.filter((c) => c.required && !headerMap.has(c.key))
    if (missingHeaders.length > 0) {
      throw new HttpException(`Missing required columns: ${missingHeaders.map((c) => c.header).join(', ')}`, HttpStatus.BAD_REQUEST)
    }

    const ownerCache = new Map<string, string>()
    const getOwnerId = async (email: string): Promise<string | null> => {
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
        const cell = row.getCell(col)
        return String(cell.value ?? '').trim()
      }
      const numValue = (key: string): number | undefined => {
        const v = value(key)
        if (!v) return undefined
        const n = Number(v.replace(/,/g, ''))
        return Number.isFinite(n) ? n : undefined
      }

      const code = value('code')
      if (!code) { skipped++; continue }

      for (const c of COLUMNS) {
        if (c.required && !value(c.key)) {
          errors.push({ row: r, field: c.key, message: `${c.header} is required` })
        }
      }
      if (errors.some((e) => e.row === r)) { skipped++; continue }

      const ownerEmail = value('ownerEmail')
      const ownerId = await getOwnerId(ownerEmail)
      if (!ownerId) {
        errors.push({ row: r, field: 'ownerEmail', message: `Unknown owner "${ownerEmail}"` })
        skipped++; continue
      }

      const status = value('status') || 'Prospect'
      if (!['Active', 'Prospect', 'Inactive'].includes(status)) {
        errors.push({ row: r, field: 'status', message: `Invalid status "${status}"` })
        skipped++; continue
      }

      try {
        await this.customers.create(
          {
            code, name: value('name'), nameTh: value('nameTh') || null,
            industry: value('industry'), status: status as 'Active' | 'Prospect' | 'Inactive',
            ownerId, city: value('city'), address: value('address'),
            taxId: value('taxId'), phone: value('phone'),
            terms: value('terms') || 'Net 30',
            openValue: numValue('openValue') ?? 0,
            lastActivity: 'Imported',
          },
          ctx,
        )
        imported++
      } catch (e) {
        errors.push({ row: r, message: e instanceof Error ? e.message : 'Create failed' })
        skipped++
      }
    }

    return { imported, skipped, errors }
  }
}
