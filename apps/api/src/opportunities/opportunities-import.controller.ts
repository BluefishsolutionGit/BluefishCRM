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
import { cellText, normalizeHeader, templateHeader } from '../common/excel-import'
import type { Request, Response } from 'express'
import type { ImportResultDto, OpportunityStage } from '@bluefish/shared'
import { SERVICE_LINES } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

const STAGES: OpportunityStage[] = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost']
// Customer resolution: match by Code first, then by Name (case-insensitive exact).
// If neither matches, a DRAFT customer is auto-created from Name so sales can
// finish enrichment later via the Customers page.
const COLUMNS: { key: string; header: string; required?: boolean }[] = [
  { key: 'title', header: 'Title', required: true },
  { key: 'customerCode', header: 'Customer Code' },
  { key: 'customerName', header: 'Customer Name' },
  // Optional — picks which of the customer's contacts to reach out to for this deal.
  { key: 'contactEmail', header: 'Contact Email' },
  { key: 'ownerEmail', header: 'Owner Email', required: true },
  { key: 'stage', header: 'Stage' },
  { key: 'value', header: 'Value' },
  { key: 'probability', header: 'Probability %' },
  { key: 'closeDate', header: 'Close Date' },
  { key: 'serviceOrProduct', header: 'Service / Product' },
  { key: 'competitor', header: 'Competitor' },
  { key: 'notes', header: 'Notes' },
]

const DRAFT_CUSTOMER_PREFIX = 'DRAFT-'
// Required non-nullable Customer fields the user hasn't given us yet — stamp
// the em-dash marker that the rest of the app already uses for "to fill in".
const DRAFT_PLACEHOLDER = '—'
// Singleton customer that absorbs opportunity rows with NO code and NO name.
// One row in Customer table, lazy-created on first use. Sales reassigns each
// opportunity to a real customer later via the opportunity modal.
const UNASSIGNED_CUSTOMER_CODE = 'UNASSIGNED'
const UNASSIGNED_CUSTOMER_NAME = '— Unassigned —'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('opportunities')
export class OpportunitiesImportController {
  constructor(private opps: OpportunitiesService, private prisma: PrismaService) {}

  @Get('import-template')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  async downloadTemplate(@Res() res: Response): Promise<void> {
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('opportunities')
    sheet.columns = COLUMNS.map((c) => ({ header: templateHeader(c), key: c.key, width: 22 }))
    sheet.getRow(1).font = { bold: true }
    sheet.addRow({
      title: 'Factory Automation Phase 3',
      customerCode: 'C-1024',
      customerName: 'Acme Industrial Co., Ltd.',
      contactEmail: 'somchai@example.com',
      ownerEmail: 'nattaya@bluefishsolution.com',
      stage: 'Proposal',
      value: 4500000,
      probability: 55,
      closeDate: '2026-10-15',
      serviceOrProduct: '3D',
      competitor: 'AlphaSoft ERP',
      notes: 'Kick-off pending CFO sign-off.',
    })
    // Second example: customer code not known yet — row will still import,
    // and a draft customer gets auto-created from the name for later cleanup.
    sheet.addRow({
      title: 'Smart Warehouse Pilot',
      customerCode: '',
      customerName: 'New Prospect From Event',
      ownerEmail: 'nattaya@bluefishsolution.com',
      stage: 'Qualification',
      value: 800000,
      probability: 20,
      closeDate: '2026-12-01',
      serviceOrProduct: '3D',
      notes: 'Met at AutomationExpo — code to be assigned.',
    })
    // Third example: neither code nor name filled — row still imports but is
    // parked under "— Unassigned —". Sales picks the real customer later.
    sheet.addRow({
      title: 'Lead From Trade Show — assign later',
      customerCode: '',
      customerName: '',
      ownerEmail: 'nattaya@bluefishsolution.com',
      stage: 'Qualification',
      value: 0,
      probability: 10,
      notes: 'Pending customer assignment.',
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
    let imported = 0, skipped = 0, draftCustomersCreated = 0, unassignedOpportunities = 0

    const headerRow = sheet.getRow(1)
    const headerMap = new Map<string, number>()
    headerRow.eachCell((cell, colNumber) => {
      const text = normalizeHeader(cellText(cell.value))
      const col = COLUMNS.find((c) => c.header.toLowerCase() === text)
      if (col) headerMap.set(col.key, colNumber)
    })
    const missing = COLUMNS.filter((c) => c.required && !headerMap.has(c.key))
    if (missing.length > 0) {
      throw new HttpException(`Missing required columns: ${missing.map((c) => c.header).join(', ')}`, HttpStatus.BAD_REQUEST)
    }
    // Either column is enough to drive the resolver — and if neither is present
    // we still accept the file, routing all rows to the Unassigned bucket.

    // Cache customer / user lookups so an N-row file doesn't cause N*2 queries
    const custByCode = new Map<string, string>()
    const custByName = new Map<string, string>() // lowercased trimmed name → id
    const ownerCache = new Map<string, string>()
    const getOwnerId = async (email: string): Promise<string | null> => {
      const norm = email.toLowerCase().trim()
      if (ownerCache.has(norm)) return ownerCache.get(norm)!
      const u = await this.prisma.user.findUnique({ where: { email: norm } })
      if (!u) return null
      ownerCache.set(norm, u.id)
      return u.id
    }

    // Seed the draft sequence from the highest existing DRAFT-NNNNN so concurrent
    // imports in the same minute don't clash. Not bullet-proof under high
    // concurrency; unique index on Customer.code catches the race.
    let draftSeq = await this.prisma.customer.count({ where: { code: { startsWith: DRAFT_CUSTOMER_PREFIX } } })

    // Lazy getter for the shared "— Unassigned —" singleton. Created on demand
    // with the first importer as owner (doesn't really matter — it's a bucket,
    // not a real account). Cached for the duration of this request.
    let unassignedCustomerId: string | null = null
    const getUnassignedCustomerId = async (ownerId: string): Promise<string> => {
      if (unassignedCustomerId) return unassignedCustomerId
      const existing = await this.prisma.customer.findFirst({ where: { code: UNASSIGNED_CUSTOMER_CODE }, select: { id: true } })
      if (existing) { unassignedCustomerId = existing.id; return existing.id }
      const created = await this.prisma.customer.create({
        data: {
          code: UNASSIGNED_CUSTOMER_CODE, name: UNASSIGNED_CUSTOMER_NAME, status: 'Prospect',
          ownerId,
          industry: DRAFT_PLACEHOLDER, city: DRAFT_PLACEHOLDER, address: DRAFT_PLACEHOLDER,
          taxId: DRAFT_PLACEHOLDER, phone: DRAFT_PLACEHOLDER, terms: DRAFT_PLACEHOLDER,
          lastActivity: 'Shared bucket for opportunities awaiting customer assignment',
        },
        select: { id: true },
      })
      unassignedCustomerId = created.id
      return created.id
    }

    // Resolution: code → name exact (case-insensitive) → auto-create draft from name.
    // If BOTH code and name are empty, the row is routed to the UNASSIGNED singleton
    // (sales assigns the real customer later via the opportunity modal).
    const resolveCustomer = async (
      code: string,
      name: string,
      ownerId: string,
    ): Promise<{ customerId: string; created: boolean; unassigned?: boolean } | { error: string; field: 'customerCode' | 'customerName' }> => {
      const normCode = code.toUpperCase().trim()
      if (normCode) {
        if (custByCode.has(normCode)) return { customerId: custByCode.get(normCode)!, created: false }
        const c = await this.prisma.customer.findFirst({ where: { code: normCode, deletedAt: null }, select: { id: true } })
        if (c) { custByCode.set(normCode, c.id); return { customerId: c.id, created: false } }
        // Code was supplied but doesn't exist — if name is also missing, mistyped
        // code gets treated as hard error so we don't silently bury the row in
        // Unassigned. Blank code + blank name is a different intent (see below).
        if (!name.trim()) return { error: `Unknown customer code "${code}"`, field: 'customerCode' }
      }

      const normName = name.trim()
      if (!normName) {
        // Both code and name blank — the user explicitly deferred the choice.
        return { customerId: await getUnassignedCustomerId(ownerId), created: false, unassigned: true }
      }
      const nameKey = normName.toLowerCase()
      if (custByName.has(nameKey)) return { customerId: custByName.get(nameKey)!, created: false }

      // Need at least two hits to detect ambiguity, so limit 2 — not findMany-all.
      const matches = await this.prisma.customer.findMany({
        where: { name: { equals: normName, mode: 'insensitive' }, deletedAt: null },
        select: { id: true },
        take: 2,
      })
      if (matches.length === 1) { custByName.set(nameKey, matches[0].id); return { customerId: matches[0].id, created: false } }
      if (matches.length > 1) return { error: `Multiple customers named "${normName}" — supply Customer Code to disambiguate`, field: 'customerName' }

      // Auto-create draft. Retry a handful of times if the generated code races
      // with a concurrent import (unique index on Customer.code).
      for (let attempt = 0; attempt < 5; attempt++) {
        draftSeq++
        const draftCode = `${DRAFT_CUSTOMER_PREFIX}${String(draftSeq).padStart(5, '0')}`
        try {
          const draft = await this.prisma.customer.create({
            data: {
              code: draftCode, name: normName, status: 'Prospect',
              ownerId, // sales who imported owns the draft
              industry: DRAFT_PLACEHOLDER, city: DRAFT_PLACEHOLDER, address: DRAFT_PLACEHOLDER,
              taxId: DRAFT_PLACEHOLDER, phone: DRAFT_PLACEHOLDER, terms: DRAFT_PLACEHOLDER,
              lastActivity: 'Auto-created from opportunity import',
            },
            select: { id: true },
          })
          custByName.set(nameKey, draft.id)
          draftCustomersCreated++
          return { customerId: draft.id, created: true }
        } catch {
          // Likely unique-constraint on code — try next sequence number.
        }
      }
      return { error: `Could not auto-create customer "${normName}"`, field: 'customerName' }
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
        return cellText(v)
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

      const codeCell = value('customerCode')
      const nameCell = value('customerName')

      // Owner resolved first — a draft or unassigned-bucket (if auto-created)
      // inherits this ownerId as its account owner.
      const ownerId = await getOwnerId(value('ownerEmail'))
      if (!ownerId) {
        errors.push({ row: r, field: 'ownerEmail', message: `Unknown owner "${value('ownerEmail')}"` })
        skipped++; continue
      }

      const resolved = await resolveCustomer(codeCell, nameCell, ownerId)
      if ('error' in resolved) {
        errors.push({ row: r, field: resolved.field, message: resolved.error })
        skipped++; continue
      }
      const customerId = resolved.customerId
      if (resolved.unassigned) unassignedOpportunities++

      const contactEmail = value('contactEmail')
      let contactId: string | undefined
      if (contactEmail) {
        // Drafts / Unassigned bucket have no contacts to match against — silently
        // skip the contact link rather than fail the whole row.
        if (resolved.created || resolved.unassigned) {
          contactId = undefined
        } else {
          const contact = await this.prisma.contact.findFirst({
            where: { customerId, email: { equals: contactEmail, mode: 'insensitive' } },
            select: { id: true },
          })
          if (!contact) {
            errors.push({ row: r, field: 'contactEmail', message: `No contact "${contactEmail}" under this customer` })
            skipped++; continue
          }
          contactId = contact.id
        }
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
          contactId,
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

    return { imported, skipped, errors, draftCustomersCreated, unassignedOpportunities }
  }

  @Get('export')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  async exportXlsx(@Res() res: Response): Promise<void> {
    const rows = await this.prisma.opportunity.findMany({
      include: {
        customer: { select: { code: true, name: true } },
        contact: { select: { email: true } },
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
      { header: 'Contact Email', key: 'contactEmail', width: 28 },
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
        contactEmail: o.contact?.email ?? '',
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
