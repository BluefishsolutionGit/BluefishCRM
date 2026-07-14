import { Controller, Get, HttpException, HttpStatus, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import * as ExcelJS from 'exceljs'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { OpportunitiesService } from './opportunities.service'
import { PrismaService } from '../prisma/prisma.service'
import { auditContext } from '../common/request-context'
import type { Request, Response } from 'express'
import type { ImportResultDto, OpportunityStage } from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

const STAGES: OpportunityStage[] = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost']
const COLUMNS: { key: string; header: string; required?: boolean }[] = [
  { key: 'title', header: 'Title', required: true },
  { key: 'customerCode', header: 'Customer Code', required: true },
  { key: 'ownerEmail', header: 'Owner Email', required: true },
  { key: 'stage', header: 'Stage' },
  { key: 'value', header: 'Value' },
  { key: 'probability', header: 'Probability %' },
  { key: 'closeDate', header: 'Close Date' },
  { key: 'serviceOrProduct', header: 'Service / Product' },
  { key: 'competitor', header: 'Competitor' },
  { key: 'notes', header: 'Notes' },
]

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('opportunities')
export class OpportunitiesImportController {
  constructor(private opps: OpportunitiesService, private prisma: PrismaService) {}

  @Get('import-template')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  async downloadTemplate(@Res() res: Response): Promise<void> {
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('opportunities')
    sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 22 }))
    sheet.getRow(1).font = { bold: true }
    sheet.addRow({
      title: 'Factory Automation Phase 3',
      customerCode: 'C-1024',
      ownerEmail: 'nattaya@bluefishsolution.com',
      stage: 'Proposal',
      value: 4500000,
      probability: 55,
      closeDate: '2026-10-15',
      serviceOrProduct: '3D',
      competitor: 'AlphaSoft ERP',
      notes: 'Kick-off pending CFO sign-off.',
    })

    // Add a hidden helper sheet with the valid enum values so users know what
    // to type. Not linked to data validation (ExcelJS support is patchy) but
    // discoverable via "Sheet 2".
    const helper = wb.addWorksheet('valid values')
    helper.columns = [
      { header: 'Stage', key: 'stage', width: 20 },
      { header: 'Service / Product', key: 'service', width: 20 },
    ]
    const helperRows = Math.max(STAGES.length, SERVICE_LINES.length)
    for (let i = 0; i < helperRows; i++) {
      helper.addRow({ stage: STAGES[i] ?? '', service: SERVICE_LINES[i] ?? '' })
    }

    const buf = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="opportunities-import-template.xlsx"')
    res.send(Buffer.from(buf as ArrayBuffer))
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_WRITE)
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

    // Cache customer / user lookups so an N-row file doesn't cause N*2 queries
    const custCache = new Map<string, string>()
    const getCustomerId = async (code: string): Promise<string | null> => {
      const norm = code.toUpperCase().trim()
      if (custCache.has(norm)) return custCache.get(norm)!
      const c = await this.prisma.customer.findUnique({ where: { code: norm } })
      if (!c) return null
      custCache.set(norm, c.id)
      return c.id
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
        const v = cell.value
        if (v instanceof Date) return v.toISOString().slice(0, 10)
        return String(v ?? '').trim()
      }
      const numValue = (key: string): number | undefined => {
        const v = value(key)
        if (!v) return undefined
        const n = Number(v.replace(/,/g, ''))
        return Number.isFinite(n) ? n : undefined
      }

      const title = value('title')
      if (!title) { skipped++; continue }

      for (const c of COLUMNS) {
        if (c.required && !value(c.key)) errors.push({ row: r, field: c.key, message: `${c.header} is required` })
      }
      if (errors.some((e) => e.row === r)) { skipped++; continue }

      const customerId = await getCustomerId(value('customerCode'))
      if (!customerId) {
        errors.push({ row: r, field: 'customerCode', message: `Unknown customer code "${value('customerCode')}"` })
        skipped++; continue
      }
      const ownerId = await getOwnerId(value('ownerEmail'))
      if (!ownerId) {
        errors.push({ row: r, field: 'ownerEmail', message: `Unknown owner "${value('ownerEmail')}"` })
        skipped++; continue
      }

      const stage = (value('stage') || 'Qualification') as OpportunityStage
      if (!STAGES.includes(stage)) {
        errors.push({ row: r, field: 'stage', message: `Invalid stage "${stage}"` })
        skipped++; continue
      }

      const prob = numValue('probability')
      if (prob !== undefined && (prob < 0 || prob > 100)) {
        errors.push({ row: r, field: 'probability', message: `Probability must be 0-100` })
        skipped++; continue
      }

      const closeDateStr = value('closeDate')
      const closeDate = closeDateStr ? closeDateStr.slice(0, 10) : undefined

      const svc = value('serviceOrProduct')
      if (svc && !(SERVICE_LINES as readonly string[]).includes(svc)) {
        errors.push({ row: r, field: 'serviceOrProduct', message: `Service must be one of: ${SERVICE_LINES.join(', ')}` })
        skipped++; continue
      }

      try {
        await this.opps.create({
          title,
          customerId,
          ownerId,
          stage,
          value: numValue('value') ?? 0,
          probability: prob ?? 20,
          closeDate,
          serviceOrProduct: svc || undefined,
          competitor: value('competitor') || undefined,
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

  @Get('export')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  async exportXlsx(@Res() res: Response): Promise<void> {
    const rows = await this.prisma.opportunity.findMany({
      include: {
        customer: { select: { code: true, name: true } },
        owner: { select: { email: true, name: true } },
      },
      orderBy: [{ stage: 'asc' }, { value: 'desc' }],
    })
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('opportunities')
    sheet.columns = [
      { header: 'Title', key: 'title', width: 32 },
      { header: 'Customer Code', key: 'customerCode', width: 14 },
      { header: 'Customer', key: 'customerName', width: 32 },
      { header: 'Owner Email', key: 'ownerEmail', width: 28 },
      { header: 'Owner Name', key: 'ownerName', width: 22 },
      { header: 'Stage', key: 'stage', width: 14 },
      { header: 'Value', key: 'value', width: 14 },
      { header: 'Probability %', key: 'probability', width: 12 },
      { header: 'Close Date', key: 'closeDate', width: 14 },
      { header: 'Service / Product', key: 'serviceOrProduct', width: 20 },
      { header: 'Competitor', key: 'competitor', width: 22 },
      { header: 'Notes', key: 'notes', width: 40 },
      { header: 'Created', key: 'createdAt', width: 20 },
    ]
    sheet.getRow(1).font = { bold: true }
    for (const o of rows) {
      sheet.addRow({
        title: o.title,
        customerCode: o.customer?.code ?? '',
        customerName: o.customer?.name ?? '',
        ownerEmail: o.owner?.email ?? '',
        ownerName: o.owner?.name ?? '',
        stage: o.stage,
        value: o.value,
        probability: o.probability,
        closeDate: o.closeDate ? o.closeDate.toISOString().slice(0, 10) : '',
        serviceOrProduct: o.serviceOrProduct ?? '',
        competitor: o.competitor ?? '',
        notes: o.notes ?? '',
        createdAt: o.createdAt.toISOString(),
      })
    }
    const stamp = new Date().toISOString().slice(0, 10)
    const buf = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="opportunities-${stamp}.xlsx"`)
    res.send(Buffer.from(buf as ArrayBuffer))
  }
}
