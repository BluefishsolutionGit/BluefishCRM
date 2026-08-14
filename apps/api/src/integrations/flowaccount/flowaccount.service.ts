import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'node:crypto'
import type {
  FlowaccountPushResultDto,
  FlowaccountStatusDto,
  FlowaccountSyncResultDto,
} from '@bluefish/shared'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../../audit/audit.service'
import type { AuditRequestContext } from '../../common/request-context'

/**
 * FlowAccount Open API integration.
 *
 * Auth: OAuth 2.0 client_credentials to `${FLOWACCOUNT_TOKEN_URL}`. The
 * resulting bearer token is cached until 60s before expiry so we don't
 * re-hit /token per request.
 *
 * Modes:
 *   - live: credentials + FLOWACCOUNT_MODE=live → real HTTPS calls
 *   - stub: no credentials OR FLOWACCOUNT_MODE=stub → in-memory fake
 *           doc/contact IDs, so dev + tests can exercise the workflow
 *           without a FlowAccount account.
 *
 * Docs referenced:
 *   - OpenAPI: https://raw.githubusercontent.com/flowaccount/open-api/main/libs/api-spec/src/api-spec.openapi.json
 *   - Portal:  https://developers.flowaccount.com/
 */
@Injectable()
export class FlowaccountService {
  private readonly log = new Logger('FlowaccountService')
  private token: { accessToken: string; expiresAt: Date; acquiredAt: Date } | null = null

  constructor(private prisma: PrismaService, private audit: AuditService, private cfg: ConfigService) {}

  // ─── Config ─────────────────────────────────────────────────────
  get mode(): 'stub' | 'live' {
    const explicit = this.cfg.get<string>('FLOWACCOUNT_MODE')
    if (explicit === 'live') return 'live'
    if (explicit === 'stub') return 'stub'
    // auto: live iff both id + secret set
    return this.cfg.get('FLOWACCOUNT_CLIENT_ID') && this.cfg.get('FLOWACCOUNT_CLIENT_SECRET') ? 'live' : 'stub'
  }
  private get culture(): string { return this.cfg.get<string>('FLOWACCOUNT_CULTURE') ?? 'th' }
  private get baseUrl(): string { return this.cfg.get<string>('FLOWACCOUNT_BASE_URL') ?? 'https://openapi.flowaccount.com/sandbox' }
  private get tokenUrl(): string { return this.cfg.get<string>('FLOWACCOUNT_TOKEN_URL') ?? 'https://openapi.flowaccount.com/v1/token' }
  /** Base of the FlowAccount web UI (not the API). Admins point this at sandbox or
   *  production without rebuilding the client. */
  private get webBaseUrl(): string { return this.cfg.get<string>('FLOWACCOUNT_WEB_BASE_URL') ?? 'https://member.flowaccount.com' }

  /** Deep-link to the FlowAccount web app for a given quotation. Returns null when
   *  we don't have an id yet — callers should render an "Open in FlowAccount" button
   *  only when this is set. */
  deepLinkFor(flowaccountId: string | null): string | null {
    if (!flowaccountId) return null
    return `${this.webBaseUrl}/documents/quotations/${encodeURIComponent(flowaccountId)}`
  }

  status(): FlowaccountStatusDto {
    return {
      configured: this.mode === 'live',
      mode: this.mode,
      baseUrl: this.baseUrl,
      culture: this.culture,
      lastTokenAcquiredAt: this.token?.acquiredAt.toISOString() ?? null,
      tokenExpiresAt: this.token?.expiresAt.toISOString() ?? null,
    }
  }

  // ─── Token acquisition (client_credentials) ─────────────────────
  private async acquireToken(): Promise<string> {
    const now = new Date()
    if (this.token && this.token.expiresAt.getTime() - now.getTime() > 60_000) {
      return this.token.accessToken
    }
    const clientId = this.cfg.get<string>('FLOWACCOUNT_CLIENT_ID')
    const clientSecret = this.cfg.get<string>('FLOWACCOUNT_CLIENT_SECRET')
    if (!clientId || !clientSecret) throw new Error('FLOWACCOUNT_CLIENT_ID / FLOWACCOUNT_CLIENT_SECRET not set')

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'flowaccount-api',
    })
    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`FlowAccount token endpoint ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as { access_token: string; expires_in: number }
    const expiresAt = new Date(now.getTime() + (data.expires_in ?? 3600) * 1000)
    this.token = { accessToken: data.access_token, expiresAt, acquiredAt: now }
    return data.access_token
  }

  private async apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.acquireToken()
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
  }

  // ─── Push quotation → FlowAccount ───────────────────────────────
  async pushQuotation(quotationId: string, ctx: AuditRequestContext): Promise<FlowaccountPushResultDto> {
    const q = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        customer: true,
        currentVersion: { include: { lines: { include: { product: true }, orderBy: { ordering: 'asc' } } } },
      },
    })
    if (!q) throw new NotFoundException(`Quotation ${quotationId} not found`)
    if (!q.currentVersion) throw new BadRequestException('Quotation has no current version')
    if (!['Approved', 'Sent', 'Accepted'].includes(q.status)) {
      throw new BadRequestException(`Quotation must be Approved / Sent / Accepted (currently ${q.status})`)
    }

    // 1. Ensure contact exists in FlowAccount for this customer
    let contactCode = q.customer.flowaccountContactCode ?? null
    let contactCreated = false
    if (!contactCode) {
      contactCode = await this.upsertContact(q.customer)
      await this.prisma.customer.update({ where: { id: q.customer.id }, data: { flowaccountContactCode: contactCode } })
      contactCreated = true
    }

    // 2. Push (or update) quotation
    const push = q.flowaccountId
      ? await this.updateFlowQuotation(q.flowaccountId, q, contactCode)
      : await this.createFlowQuotation(q, contactCode)

    const now = new Date()
    await this.prisma.quotation.update({
      where: { id: q.id },
      data: {
        flowaccountId: push.id,
        flowaccountDocumentNumber: push.documentNumber ?? null,
        flowaccountStatus: push.status,
        flowaccountLastSyncedAt: now,
      },
    })
    await this.audit.log({
      ...ctx,
      action: q.flowaccountId ? 'flowaccount.quotation.update' : 'flowaccount.quotation.push',
      entity: 'quotation',
      entityId: q.id,
      metadata: { flowaccountId: push.id, mode: this.mode, contactCode },
    })
    return {
      quotationId: q.id,
      flowaccountId: push.id,
      flowaccountDocumentNumber: push.documentNumber ?? null,
      flowaccountStatus: push.status,
      contactCode,
      contactCreated,
      pushedAt: now.toISOString(),
      isStub: this.mode === 'stub',
    }
  }

  async syncQuotationStatus(quotationId: string, ctx: AuditRequestContext): Promise<FlowaccountSyncResultDto> {
    const q = await this.prisma.quotation.findUnique({ where: { id: quotationId } })
    if (!q) throw new NotFoundException(`Quotation ${quotationId} not found`)
    if (!q.flowaccountId) throw new BadRequestException('Quotation has not been pushed to FlowAccount yet')

    const previous = q.flowaccountStatus
    const status = await this.fetchStatus(q.flowaccountId)
    const now = new Date()
    await this.prisma.quotation.update({
      where: { id: q.id },
      data: { flowaccountStatus: status, flowaccountLastSyncedAt: now },
    })
    if (previous !== status) {
      await this.audit.log({
        ...ctx,
        action: 'flowaccount.quotation.status_change',
        entity: 'quotation',
        entityId: q.id,
        metadata: { previous, current: status, flowaccountId: q.flowaccountId },
      })
    }
    return {
      quotationId: q.id,
      flowaccountId: q.flowaccountId,
      previousStatus: previous,
      currentStatus: status,
      syncedAt: now.toISOString(),
      isStub: this.mode === 'stub',
    }
  }

  /** Cron job — poll all pushed quotations that are still open. */
  async pollAllPushed(): Promise<{ polled: number; changed: number }> {
    if (this.mode === 'stub') return { polled: 0, changed: 0 }
    const rows = await this.prisma.quotation.findMany({
      where: {
        flowaccountId: { not: null },
        // Exclude terminal states
        flowaccountStatus: { notIn: ['accepted', 'rejected', 'converted', 'cancelled'] },
      },
      select: { id: true, flowaccountId: true, flowaccountStatus: true },
      take: 200,
    })
    let changed = 0
    for (const r of rows) {
      if (!r.flowaccountId) continue
      try {
        const status = await this.fetchStatus(r.flowaccountId)
        if (status !== r.flowaccountStatus) {
          changed++
          await this.prisma.quotation.update({
            where: { id: r.id },
            data: { flowaccountStatus: status, flowaccountLastSyncedAt: new Date() },
          })
        }
      } catch (e) {
        this.log.warn(`poll ${r.flowaccountId} failed: ${(e as Error).message}`)
      }
    }
    return { polled: rows.length, changed }
  }

  // ─── Live / stub implementations ────────────────────────────────
  private async upsertContact(customer: { id: string; name: string; nameTh: string | null; taxId: string; address: string; city: string; phone: string }): Promise<string> {
    if (this.mode === 'stub') {
      return 'FAC-' + customer.id.slice(-8).toUpperCase()
    }
    const body = {
      contactCode: 'CRM-' + customer.id.slice(-8).toUpperCase(),
      nameLocal: customer.nameTh ?? customer.name,
      nameForeign: customer.name,
      companyTaxId: customer.taxId,
      branch: 'สำนักงานใหญ่',
      addressLocal: customer.address,
      phone1: customer.phone,
      contactType: 3, // Client
      contactGroup: customer.taxId?.length === 13 ? 3 : 1, // Juristic vs Individual
    }
    const res = await this.apiFetch(`/api/${this.culture}/contacts`, { method: 'POST', body: JSON.stringify(body) })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Contacts POST ${res.status}: ${text.slice(0, 300)}`)
    }
    const data = (await res.json()) as { contactCode?: string; id?: string }
    return data.contactCode ?? data.id ?? body.contactCode
  }

  private toSimpleDocument(q: QuotationForPush, contactCode: string) {
    const cv = q.currentVersion!
    const publishedOn = new Date().toISOString()
    const dueDate = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    return {
      contactCode,
      contactName: q.customer.name,
      contactTaxId: q.customer.taxId,
      contactBranch: 'สำนักงานใหญ่',
      contactAddress: q.customer.address,
      contactZipCode: '',
      contactGroup: q.customer.taxId?.length === 13 ? 3 : 1,
      publishedOn,
      dueDate,
      reference: q.no,
      externalId: q.id,
      isVatInclusive: false,
      isVat: cv.vatPct > 0,
      subTotal: cv.subtotal,
      discountPercentage: cv.discountPct,
      discountAmount: cv.discountAmt,
      totalAfterDiscount: cv.subtotal - cv.discountAmt,
      vatAmount: cv.vatAmt,
      grandTotal: cv.grandTotal,
      remarks: cv.notes ?? '',
      items: cv.lines.map((l) => ({
        type: 1,
        productCode: l.product?.code ?? '',
        name: l.itemName,
        description: l.description ?? '',
        quantity: l.quantity,
        unitName: 'unit',
        pricePerUnit: l.unitPrice,
        total: l.amount,
      })),
    }
  }

  private async createFlowQuotation(q: QuotationForPush, contactCode: string): Promise<{ id: string; documentNumber: string | null; status: string }> {
    if (this.mode === 'stub') {
      const id = 'FA-' + randomBytes(6).toString('hex').toUpperCase()
      return { id, documentNumber: `QT-${new Date().getFullYear()}-${randomBytes(2).toString('hex').toUpperCase()}`, status: 'draft' }
    }
    const body = this.toSimpleDocument(q, contactCode)
    const res = await this.apiFetch(`/${this.culture}/quotations/simple-document`, { method: 'POST', body: JSON.stringify(body) })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Quotation POST ${res.status}: ${text.slice(0, 300)}`)
    }
    const data = (await res.json()) as { id?: string; documentNumber?: string; status?: string }
    return { id: data.id ?? '', documentNumber: data.documentNumber ?? null, status: data.status ?? 'draft' }
  }

  private async updateFlowQuotation(externalId: string, q: QuotationForPush, contactCode: string): Promise<{ id: string; documentNumber: string | null; status: string }> {
    if (this.mode === 'stub') {
      return { id: externalId, documentNumber: q.flowaccountDocumentNumber, status: q.flowaccountStatus ?? 'draft' }
    }
    const body = this.toSimpleDocument(q, contactCode)
    const res = await this.apiFetch(`/${this.culture}/quotations/simple-document/${externalId}`, { method: 'PUT', body: JSON.stringify(body) })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Quotation PUT ${res.status}: ${text.slice(0, 300)}`)
    }
    const data = (await res.json()) as { id?: string; documentNumber?: string; status?: string }
    return { id: data.id ?? externalId, documentNumber: data.documentNumber ?? q.flowaccountDocumentNumber, status: data.status ?? q.flowaccountStatus ?? 'draft' }
  }

  private async fetchStatus(externalId: string): Promise<string> {
    if (this.mode === 'stub') {
      // deterministic stub: rotate through statuses so poll tests see change
      const seq = ['draft', 'sent', 'accepted']
      const idx = Math.abs(hashCode(externalId)) % seq.length
      return seq[idx]
    }
    const res = await this.apiFetch(`/${this.culture}/quotations/${externalId}`)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Quotation GET ${res.status}: ${text.slice(0, 300)}`)
    }
    const data = (await res.json()) as { status?: string }
    return data.status ?? 'unknown'
  }
}

type QuotationForPush = {
  id: string
  no: string
  flowaccountId: string | null
  flowaccountDocumentNumber: string | null
  flowaccountStatus: string | null
  customer: { id: string; name: string; taxId: string; address: string; city: string; phone: string }
  currentVersion: {
    subtotal: number; discountPct: number; discountAmt: number
    vatPct: number; vatAmt: number; grandTotal: number
    notes: string | null
    lines: Array<{ itemName: string; description: string | null; quantity: number; unitPrice: number; amount: number; product: { code: string } | null }>
  } | null
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return h
}
