import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { FileStorageService } from './file-storage.service'
import { OcrService } from './ocr.service'
import type { DocumentDto, DocumentCategory, DocumentVersionDto } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: FileStorageService,
    private ocr: OcrService,
  ) {}

  async list(filter: { customerId?: string; opportunityId?: string; quotationId?: string; category?: string }): Promise<DocumentDto[]> {
    const rows = await this.prisma.document.findMany({
      where: filter,
      include: this.includeAll(),
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => this.toDto(r))
  }

  async findOne(id: string): Promise<DocumentDto> {
    const row = await this.prisma.document.findUnique({ where: { id }, include: this.includeAll() })
    if (!row) throw new NotFoundException('Document not found')
    return this.toDto(row)
  }

  async getVersionForDownload(versionId: string) {
    const row = await this.prisma.documentVersion.findUnique({ where: { id: versionId } })
    if (!row) throw new NotFoundException('Version not found')
    const buf = await this.storage.get(row.storageKey)
    return { buffer: buf, filename: row.filename, mimeType: row.mimeType }
  }

  async upload(input: {
    name?: string; customerId?: string; opportunityId?: string; quotationId?: string
    category?: DocumentCategory
    file: { buffer: Buffer; originalname: string; mimetype: string }
  }, uploaderId: string, ctx: AuditRequestContext): Promise<DocumentDto> {
    const { file } = input
    if (!file || !file.buffer || file.buffer.length === 0) throw new BadRequestException('Empty file')

    const stored = await this.storage.put(file.buffer, file.originalname)

    const document = await this.prisma.document.create({
      data: {
        name: input.name ?? file.originalname,
        customerId: input.customerId ?? null,
        opportunityId: input.opportunityId ?? null,
        quotationId: input.quotationId ?? null,
        category: input.category ?? 'other',
        uploadedById: uploaderId,
      },
    })

    const version = await this.prisma.documentVersion.create({
      data: {
        documentId: document.id, versionNo: 1,
        filename: file.originalname, storageKey: stored.key,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: stored.size, uploadedById: uploaderId,
      },
    })
    await this.prisma.document.update({ where: { id: document.id }, data: { currentVersionId: version.id } })

    await this.audit.log({ ...ctx, action: 'document.upload', entity: 'document', entityId: document.id, metadata: { versionNo: 1, filename: file.originalname } })

    // OCR async — don't block response
    await this.runOcr(version.id, file.buffer, file.originalname, file.mimetype)

    return this.findOne(document.id)
  }

  async uploadNewVersion(documentId: string, file: { buffer: Buffer; originalname: string; mimetype: string }, uploaderId: string, ctx: AuditRequestContext): Promise<DocumentDto> {
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
        sizeBytes: stored.size, uploadedById: uploaderId,
      },
    })
    await this.prisma.document.update({ where: { id: documentId }, data: { currentVersionId: version.id } })
    await this.audit.log({ ...ctx, action: 'document.upload_version', entity: 'document', entityId: documentId, metadata: { versionNo: nextNo } })

    await this.runOcr(version.id, file.buffer, file.originalname, file.mimetype)

    return this.findOne(documentId)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const doc = await this.prisma.document.findUnique({ where: { id }, include: { versions: true } })
    if (!doc) throw new NotFoundException('Document not found')
    for (const v of doc.versions) {
      await this.storage.delete(v.storageKey)
    }
    await this.prisma.document.delete({ where: { id } })
    await this.audit.log({ ...ctx, action: 'document.delete', entity: 'document', entityId: id })
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
      versions: { select: { id: true, versionNo: true, createdAt: true }, orderBy: { versionNo: 'desc' as const } },
    }
  }

  private toDto = (row: {
    id: string; name: string; category: string; customerId: string | null
    opportunityId: string | null; quotationId: string | null; contractId: string | null
    createdAt: Date; updatedAt: Date
    customer: { name: string } | null
    uploadedBy: { name: string }
    currentVersion: null | {
      id: string; versionNo: number; filename: string; mimeType: string; sizeBytes: number
      createdAt: Date; uploadedBy: { name: string }
      extraction: null | { status: string; classification: string | null; extractedText: string | null; fields: unknown; processedAt: Date | null }
    }
    versions: Array<{ id: string; versionNo: number; createdAt: Date }>
  }): DocumentDto => {
    const cv = row.currentVersion
    const currentVersion: DocumentVersionDto | null = cv ? {
      id: cv.id, versionNo: cv.versionNo, filename: cv.filename,
      mimeType: cv.mimeType, sizeBytes: cv.sizeBytes,
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
      id: row.id, name: row.name, category: row.category as DocumentCategory,
      customerId: row.customerId, customerName: row.customer?.name ?? null,
      opportunityId: row.opportunityId, quotationId: row.quotationId, contractId: row.contractId,
      uploadedByName: row.uploadedBy.name,
      currentVersion,
      versions: row.versions.map((v) => ({ id: v.id, versionNo: v.versionNo, createdAt: v.createdAt.toISOString() })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}
