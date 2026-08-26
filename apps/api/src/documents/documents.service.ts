import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { FileStorageService } from './file-storage.service'
import { OcrService } from './ocr.service'
import { SERVICE_LINES } from '@bluefish/shared'
import type { DocumentDto, DocumentCategory, DocumentKind, DocumentVersionDto, ServiceLine } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'
import { loadServiceScope } from '../common/service-scope'
import type { Request } from 'express'

const sanitizeServiceLines = (values: readonly string[] | undefined | null): ServiceLine[] => {
  if (!values) return []
  const set = new Set<ServiceLine>()
  for (const v of values) {
    if ((SERVICE_LINES as readonly string[]).includes(v)) set.add(v as ServiceLine)
  }
  return [...set]
}

/** For lists — restrict to central or overlapping services. `null` = no restriction. */
async function documentScopeFilter(prisma: PrismaService, req: Request | undefined | null): Promise<Record<string, unknown> | null> {
  if (!req) return null
  const scope = await loadServiceScope(prisma, req)
  if (scope.viewAll) return null
  if (scope.services.length === 0) return { isCentral: true }
  return {
    OR: [
      { isCentral: true },
      { serviceLines: { hasSome: scope.services } },
    ],
  }
}

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: FileStorageService,
    private ocr: OcrService,
  ) {}

  async list(
    req: Request,
    filter: {
      customerId?: string; opportunityId?: string; quotationId?: string; contractId?: string
      category?: string; service?: string; isCentral?: boolean; q?: string
    },
  ): Promise<DocumentDto[]> {
    const where: Record<string, unknown> = {}
    if (filter.customerId) where.customerId = filter.customerId
    if (filter.opportunityId) where.opportunityId = filter.opportunityId
    if (filter.quotationId) where.quotationId = filter.quotationId
    if (filter.contractId) where.contractId = filter.contractId
    if (filter.category) where.category = filter.category
    if (filter.service && (SERVICE_LINES as readonly string[]).includes(filter.service)) {
      where.serviceLines = { has: filter.service }
    }
    if (typeof filter.isCentral === 'boolean') where.isCentral = filter.isCentral
    if (filter.q?.trim()) {
      const q = filter.q.trim()
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { code: { contains: q, mode: 'insensitive' } } },
      ]
    }
    const scopeFilter = await documentScopeFilter(this.prisma, req)
    if (scopeFilter) {
      // Compose: user must match the explicit filters AND the scope filter.
      // Prisma AND merges shallowly — safest to wrap.
      const rows = await this.prisma.document.findMany({
        where: { AND: [where, scopeFilter] },
        include: this.includeAll(),
        orderBy: { createdAt: 'desc' },
      })
      return rows.map((r) => this.toDto(r))
    }
    const rows = await this.prisma.document.findMany({
      where,
      include: this.includeAll(),
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => this.toDto(r))
  }

  async createLink(input: {
    name: string; url: string; category?: DocumentCategory
    customerId?: string; opportunityId?: string; quotationId?: string; contractId?: string
    serviceLines?: ServiceLine[]; isCentral?: boolean; description?: string
  }, uploaderId: string, ctx: AuditRequestContext): Promise<DocumentDto> {
    const url = input.url.trim()
    if (!/^https?:\/\//i.test(url)) throw new BadRequestException('URL must start with http:// or https://')
    const doc = await this.prisma.document.create({
      data: {
        name: input.name.trim() || url,
        description: input.description?.trim() || null,
        kind: 'link', url,
        customerId: input.customerId ?? null,
        opportunityId: input.opportunityId ?? null,
        quotationId: input.quotationId ?? null,
        contractId: input.contractId ?? null,
        category: input.category ?? 'other',
        serviceLines: sanitizeServiceLines(input.serviceLines),
        isCentral: input.isCentral ?? false,
        uploadedById: uploaderId,
      },
    })
    await this.audit.log({ ...ctx, action: 'document.attach_link', entity: 'document', entityId: doc.id, metadata: { url } })
    return this.findOneUnchecked(doc.id)
  }

  async findOne(id: string, req: Request): Promise<DocumentDto> {
    const scopeFilter = await documentScopeFilter(this.prisma, req)
    const row = scopeFilter
      ? await this.prisma.document.findFirst({ where: { AND: [{ id }, scopeFilter] }, include: this.includeAll() })
      : await this.prisma.document.findUnique({ where: { id }, include: this.includeAll() })
    if (!row) throw new NotFoundException('Document not found')
    return this.toDto(row)
  }

  /** Internal — skips scoping. Used after write, when the caller just created/updated. */
  private async findOneUnchecked(id: string): Promise<DocumentDto> {
    const row = await this.prisma.document.findUnique({ where: { id }, include: this.includeAll() })
    if (!row) throw new NotFoundException('Document not found')
    return this.toDto(row)
  }

  async getVersionForDownload(versionId: string, req: Request) {
    const row = await this.prisma.documentVersion.findUnique({
      where: { id: versionId }, include: { document: true },
    })
    if (!row) throw new NotFoundException('Version not found')
    // Scope: reuse findOne to enforce; throws 404 when out-of-scope.
    await this.findOne(row.document.id, req)
    const buf = await this.storage.get(row.storageKey)
    return { buffer: buf, filename: row.filename, mimeType: row.mimeType }
  }

  async upload(input: {
    name?: string; description?: string
    customerId?: string; opportunityId?: string; quotationId?: string; contractId?: string
    category?: DocumentCategory
    serviceLines?: ServiceLine[]; isCentral?: boolean
    versionNotes?: string
    file: { buffer: Buffer; originalname: string; mimetype: string }
  }, uploaderId: string, ctx: AuditRequestContext): Promise<DocumentDto> {
    const { file } = input
    if (!file || !file.buffer || file.buffer.length === 0) throw new BadRequestException('Empty file')

    const stored = await this.storage.put(file.buffer, file.originalname)

    const document = await this.prisma.document.create({
      data: {
        name: input.name ?? file.originalname,
        description: input.description?.trim() || null,
        customerId: input.customerId ?? null,
        opportunityId: input.opportunityId ?? null,
        quotationId: input.quotationId ?? null,
        contractId: input.contractId ?? null,
        category: input.category ?? 'other',
        serviceLines: sanitizeServiceLines(input.serviceLines),
        isCentral: input.isCentral ?? false,
        uploadedById: uploaderId,
      },
    })

    const version = await this.prisma.documentVersion.create({
      data: {
        documentId: document.id, versionNo: 1,
        filename: file.originalname, storageKey: stored.key,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: stored.size,
        notes: input.versionNotes?.trim() || null,
        uploadedById: uploaderId,
      },
    })
    await this.prisma.document.update({ where: { id: document.id }, data: { currentVersionId: version.id } })

    await this.audit.log({ ...ctx, action: 'document.upload', entity: 'document', entityId: document.id, metadata: { versionNo: 1, filename: file.originalname } })

    // OCR — inline to keep the demo simple
    await this.runOcr(version.id, file.buffer, file.originalname, file.mimetype)

    return this.findOneUnchecked(document.id)
  }

  async uploadNewVersion(documentId: string, file: { buffer: Buffer; originalname: string; mimetype: string }, uploaderId: string, ctx: AuditRequestContext, opts: { notes?: string } = {}): Promise<DocumentDto> {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } })
    if (!doc) throw new NotFoundException('Document not found')
    const latest = await this.prisma.documentVersion.findFirst({ where: { documentId }, orderBy: { versionNo: 'desc' } })
    const nextNo = (latest?.versionNo ?? 0) + 1
    const stored = await this.storage.put(file.buffer, file.originalname)

    const version = await this.prisma.documentVersion.create({
      data: {
        documentId, versionNo: nextNo,
        filename: file.originalname, storageKey: stored.key,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: stored.size,
        notes: opts.notes?.trim() || null,
        uploadedById: uploaderId,
      },
    })
    await this.prisma.document.update({ where: { id: documentId }, data: { currentVersionId: version.id } })
    await this.audit.log({ ...ctx, action: 'document.upload_version', entity: 'document', entityId: documentId, metadata: { versionNo: nextNo, notes: opts.notes } })

    await this.runOcr(version.id, file.buffer, file.originalname, file.mimetype)

    return this.findOneUnchecked(documentId)
  }

  async setCurrentVersion(documentId: string, versionId: string, ctx: AuditRequestContext): Promise<DocumentDto> {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } })
    if (!doc) throw new NotFoundException('Document not found')
    const version = await this.prisma.documentVersion.findFirst({ where: { id: versionId, documentId } })
    if (!version) throw new NotFoundException('Version not found for this document')
    await this.prisma.document.update({ where: { id: documentId }, data: { currentVersionId: versionId } })
    await this.audit.log({ ...ctx, action: 'document.set_current_version', entity: 'document', entityId: documentId, metadata: { versionNo: version.versionNo } })
    return this.findOneUnchecked(documentId)
  }

  async update(id: string, input: {
    name?: string; description?: string | null; category?: DocumentCategory
    serviceLines?: ServiceLine[]; isCentral?: boolean
  }, ctx: AuditRequestContext): Promise<DocumentDto> {
    const existing = await this.prisma.document.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Document not found')
    const data: Record<string, unknown> = {}
    if (input.name !== undefined) {
      const n = input.name.trim()
      if (!n) throw new BadRequestException('Name cannot be blank')
      data.name = n
    }
    if (input.description !== undefined) data.description = input.description?.trim() || null
    if (input.category !== undefined) data.category = input.category
    if (input.serviceLines !== undefined) data.serviceLines = { set: sanitizeServiceLines(input.serviceLines) }
    if (input.isCentral !== undefined) data.isCentral = input.isCentral
    if (Object.keys(data).length === 0) return this.findOneUnchecked(id)
    await this.prisma.document.update({ where: { id }, data })
    await this.audit.log({ ...ctx, action: 'document.update', entity: 'document', entityId: id, before: existing, after: { ...existing, ...data } })
    return this.findOneUnchecked(id)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const doc = await this.prisma.document.findUnique({ where: { id }, include: { versions: true } })
    if (!doc) throw new NotFoundException('Document not found')
    if (doc.kind !== 'link') {
      for (const v of doc.versions) {
        await this.storage.delete(v.storageKey)
      }
    }
    await this.prisma.document.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'document.delete', entity: 'document', entityId: id })
  }

  async deleteVersion(documentId: string, versionId: string, ctx: AuditRequestContext): Promise<DocumentDto> {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId }, include: { versions: true } })
    if (!doc) throw new NotFoundException('Document not found')
    if (doc.versions.length <= 1) throw new BadRequestException('Cannot remove the only version — delete the document instead')
    const version = doc.versions.find((v) => v.id === versionId)
    if (!version) throw new NotFoundException('Version not found')

    // If the version we're removing is the current one, pick the next-latest as current.
    if (doc.currentVersionId === versionId) {
      const remaining = doc.versions.filter((v) => v.id !== versionId).sort((a, b) => b.versionNo - a.versionNo)
      await this.prisma.document.update({ where: { id: documentId }, data: { currentVersionId: remaining[0].id } })
    }
    if (doc.kind !== 'link') await this.storage.delete(version.storageKey)
    await this.prisma.documentVersion.delete({ where: { id: versionId } })
    await this.audit.log({ ...ctx, action: 'document.delete_version', entity: 'document', entityId: documentId, metadata: { versionNo: version.versionNo } })
    return this.findOneUnchecked(documentId)
  }

  private async runOcr(versionId: string, buffer: Buffer, filename: string, mimeType: string) {
    const result = await this.ocr.extract(buffer, filename, mimeType)
    await this.prisma.documentExtraction.upsert({
      where: { documentVersionId: versionId },
      update: {
        status: result.status,
        classification: result.classification,
        extractedText: result.extractedText,
        fields: result.fields,
        processedAt: new Date(),
      },
      create: {
        documentVersionId: versionId,
        status: result.status,
        classification: result.classification,
        extractedText: result.extractedText,
        fields: result.fields,
        processedAt: new Date(),
      },
    })
    // Auto-set document category from classifier if still 'other'
    const version = await this.prisma.documentVersion.findUnique({ where: { id: versionId } })
    if (version) {
      const doc = await this.prisma.document.findUnique({ where: { id: version.documentId } })
      if (doc && doc.category === 'other' && result.classification !== 'other') {
        await this.prisma.document.update({ where: { id: doc.id }, data: { category: result.classification } })
      }
    }
  }

  private includeAll() {
    return {
      customer: true, uploadedBy: true,
      currentVersion: { include: { uploadedBy: true, extraction: true } },
      versions: {
        include: { uploadedBy: { select: { name: true } } },
        orderBy: { versionNo: 'desc' as const },
      },
    }
  }

  private toDto = (row: {
    id: string; name: string; description: string | null; category: string; kind: string; url: string | null
    serviceLines: string[]; isCentral: boolean
    customerId: string | null
    opportunityId: string | null; quotationId: string | null; contractId: string | null
    createdAt: Date; updatedAt: Date
    customer: { name: string; code: string } | null
    uploadedBy: { name: string }
    currentVersion: null | {
      id: string; versionNo: number; filename: string; mimeType: string; sizeBytes: number
      notes: string | null; createdAt: Date; uploadedBy: { name: string }
      extraction: null | { status: string; classification: string | null; extractedText: string | null; fields: unknown; processedAt: Date | null }
    }
    versions: Array<{ id: string; versionNo: number; filename: string; sizeBytes: number; notes: string | null; createdAt: Date; uploadedBy: { name: string } }>
  }): DocumentDto => {
    const cv = row.currentVersion
    const currentVersion: DocumentVersionDto | null = cv ? {
      id: cv.id, versionNo: cv.versionNo, filename: cv.filename,
      mimeType: cv.mimeType, sizeBytes: cv.sizeBytes, notes: cv.notes,
      uploadedByName: cv.uploadedBy.name, createdAt: cv.createdAt.toISOString(),
      extraction: cv.extraction ? {
        status: cv.extraction.status as 'pending' | 'ready' | 'error',
        classification: cv.extraction.classification,
        extractedText: cv.extraction.extractedText,
        fields: cv.extraction.fields as Record<string, string | number | null> | null,
        processedAt: cv.extraction.processedAt?.toISOString() ?? null,
      } : null,
    } : null

    return {
      id: row.id, name: row.name, description: row.description,
      category: row.category as DocumentCategory,
      kind: (row.kind === 'link' ? 'link' : 'file') as DocumentKind, url: row.url,
      serviceLines: sanitizeServiceLines(row.serviceLines),
      isCentral: row.isCentral,
      customerId: row.customerId, customerName: row.customer?.name ?? null, customerCode: row.customer?.code ?? null,
      opportunityId: row.opportunityId, quotationId: row.quotationId, contractId: row.contractId,
      uploadedByName: row.uploadedBy.name,
      currentVersion,
      versions: row.versions.map((v) => ({
        id: v.id, versionNo: v.versionNo,
        filename: v.filename, sizeBytes: v.sizeBytes, notes: v.notes,
        createdAt: v.createdAt.toISOString(),
        uploadedByName: v.uploadedBy.name,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
