import type {
  ActivityDto,
  ContactDto,
  ContractDashboardDto,
  ContractDto,
  ContractTemplateDto,
  ContractTypeDto,
  CreateContractTypeDto,
  CreateIndustryTypeDto,
  IndustryTypeDto,
  UpdateContractTypeDto,
  UpdateIndustryTypeDto,
  CreateActivityDto,
  CreateContactDto,
  CreateContractDto,
  CreateContractFromTemplateDto,
  CreateCustomerDto,
  CreateLeadDto,
  CreateObligationDto,
  CreateOpportunityDto,
  CreateProductDto,
  CreateQuotationDto,
  CreateVersionDto,
  ConvertLeadDto,
  CustomerDto,
  DocumentCategory,
  DocumentDto,
  DuplicateCheckResult,
  ForecastDto,
  ImportResultDto,
  LeadDto,
  LoginResponse,
  ObligationDto,
  OpportunityDto,
  OpportunityStage,
  ProductDto,
  QuotationDto,
  UpdateActivityDto,
  UpdateContactDto,
  UpdateContractDto,
  UpdateCustomerDto,
  UpdateLeadDto,
  UpdateOpportunityDto,
  UpdateProductDto,
  UserDto,
} from '@bluefish/shared'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:4000/api'
const TOKEN_KEY = 'bluefish.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let refreshInFlight: Promise<boolean> | null = null

async function attemptRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        if (!res.ok) return false
        const body = (await res.json()) as { accessToken: string }
        if (!body.accessToken) return false
        setToken(body.accessToken)
        return true
      } catch {
        return false
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

/**
 * Fetch a binary file from the API with the bearer token attached, then trigger
 * a browser download. Use this instead of a raw <a href={apiUrl}> — anchor tags
 * cannot carry the Authorization header and get 401'd on protected endpoints.
 */
async function authDownload(path: string, fallbackFilename: string): Promise<void> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${API_BASE}${path}`, { headers, credentials: 'include' })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = (await res.json()) as { message?: string | string[] }
      if (body.message) msg = Array.isArray(body.message) ? body.message.join(', ') : body.message
    } catch { /* not JSON */ }
    throw new ApiError(res.status, msg)
  }
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = disposition.match(/filename="([^"]+)"/)
  const filename = match ? match[1] : fallbackFilename
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Build a query-string suffix for the dashboards endpoints. Empty/undefined
 *  values are skipped and 'all' is treated as "no filter" to match Pipeline's
 *  chip conventions. */
function dashQs(filter: { serviceOrProduct?: string; ownerId?: string; period?: string }): string {
  const qs = new URLSearchParams()
  if (filter.serviceOrProduct && filter.serviceOrProduct !== 'all') qs.set('serviceOrProduct', filter.serviceOrProduct)
  if (filter.ownerId && filter.ownerId !== 'all') qs.set('ownerId', filter.ownerId)
  if (filter.period) qs.set('period', filter.period)
  const s = qs.toString()
  return s ? `?${s}` : ''
}

async function request<T>(path: string, init: RequestInit = {}, _retry = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' })
  if (res.status === 401 && !_retry && path !== '/auth/login' && path !== '/auth/refresh') {
    const refreshed = await attemptRefresh()
    if (refreshed) return request<T>(path, init, true)
  }
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = (await res.json()) as { message?: string | string[] }
      if (body.message) msg = Array.isArray(body.message) ? body.message.join(', ') : body.message
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  loginMfa: (mfaToken: string, code: string) =>
    request<LoginResponse>('/auth/login/mfa', { method: 'POST', body: JSON.stringify({ mfaToken, code }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<UserDto>('/users/me'),
  updateSelf: (patch: { name?: string; timezone?: string }) =>
    request<UserDto>('/users/me', { method: 'PATCH', body: JSON.stringify(patch) }),

  customers: (query?: string, tagId?: string) => {
    const qs = new URLSearchParams()
    if (query) qs.set('q', query)
    if (tagId) qs.set('tagId', tagId)
    const s = qs.toString()
    return request<CustomerDto[]>(`/customers${s ? `?${s}` : ''}`)
  },
  customer: (id: string) => request<CustomerDto>(`/customers/${id}`),
  createCustomer: (data: CreateCustomerDto) =>
    request<CustomerDto>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: UpdateCustomerDto) =>
    request<CustomerDto>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCustomer: (id: string) => request<void>(`/customers/${id}`, { method: 'DELETE' }),
  importCustomers: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<ImportResultDto>('/customers/import', { method: 'POST', body: form })
  },

  contacts: (customerId: string) =>
    request<ContactDto[]>(`/customers/${customerId}/contacts`),
  searchContacts: (q: string) =>
    request<import('@bluefish/shared').ContactSearchResultDto[]>(`/contacts/search?q=${encodeURIComponent(q)}`),
  createContact: (customerId: string, data: CreateContactDto) =>
    request<ContactDto>(`/customers/${customerId}/contacts`, { method: 'POST', body: JSON.stringify(data) }),
  updateContact: (id: string, data: UpdateContactDto) =>
    request<ContactDto>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteContact: (id: string) => request<void>(`/contacts/${id}`, { method: 'DELETE' }),

  // ─────── Tags ───────
  tags: () => request<import('@bluefish/shared').TagDto[]>('/tags'),
  createTag: (data: import('@bluefish/shared').CreateTagDto) =>
    request<import('@bluefish/shared').TagDto>('/tags', { method: 'POST', body: JSON.stringify(data) }),
  updateTag: (id: string, data: import('@bluefish/shared').UpdateTagDto) =>
    request<import('@bluefish/shared').TagDto>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTag: (id: string) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
  setCustomerTags: (customerId: string, tagIds: string[]) =>
    request<import('@bluefish/shared').TagDto[]>(`/customers/${customerId}/tags`, { method: 'PUT', body: JSON.stringify({ tagIds }) }),

  users: () => request<UserDto[]>('/users'),
  roles: () => request<import('@bluefish/shared').RoleDto[]>('/roles'),
  createUser: (data: import('@bluefish/shared').CreateUserDto) =>
    request<UserDto>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: import('@bluefish/shared').UpdateUserDto) =>
    request<UserDto>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deactivateUser: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
  adminResetPassword: (id: string, newPassword: string) =>
    request<void>(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/users/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  forgotPassword: (email: string) =>
    request<void>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) =>
    request<void>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),

  mfaSetup: () => request<{ secret: string; otpauth: string }>('/users/me/mfa/setup', { method: 'POST' }),
  mfaVerify: (code: string) =>
    request<void>('/users/me/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  mfaDisable: (code: string) =>
    request<void>('/users/me/mfa/disable', { method: 'POST', body: JSON.stringify({ code }) }),

  // ─────── Leads ───────
  leads: () => request<LeadDto[]>('/leads'),
  importLeads: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<ImportResultDto>('/leads/import', { method: 'POST', body: form })
  },
  leadsImportTemplateUrl: () => `${API_BASE}/leads/import-template`,
  leadsExportUrl: () => `${API_BASE}/leads/export`,
  lead: (id: string) => request<LeadDto>(`/leads/${id}`),
  createLead: (data: CreateLeadDto) => request<LeadDto>('/leads', { method: 'POST', body: JSON.stringify(data) }),
  updateLead: (id: string, data: UpdateLeadDto) => request<LeadDto>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLead: (id: string) => request<void>(`/leads/${id}`, { method: 'DELETE' }),
  assignLead: (id: string, ownerId: string | null) =>
    request<LeadDto>(`/leads/${id}/assign`, { method: 'POST', body: JSON.stringify({ ownerId }) }),
  duplicateCheckLead: (input: { name: string; companyName: string; email?: string; phone?: string }) =>
    request<DuplicateCheckResult>('/leads/duplicate-check', { method: 'POST', body: JSON.stringify(input) }),
  convertLead: (id: string, data: ConvertLeadDto) =>
    request<{ lead: LeadDto; opportunityId: string }>(`/leads/${id}/convert`, { method: 'POST', body: JSON.stringify(data) }),

  // ─────── Products ───────
  products: (includeInactive?: boolean) =>
    request<ProductDto[]>(`/products${includeInactive ? '?all=1' : ''}`),
  createProduct: (data: CreateProductDto) => request<ProductDto>('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: UpdateProductDto) => request<ProductDto>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: (id: string) => request<void>(`/products/${id}`, { method: 'DELETE' }),

  // ─────── Opportunities ───────
  importOpportunities: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<ImportResultDto>('/opportunities/import', { method: 'POST', body: form })
  },
  opportunitiesImportTemplateUrl: () => `${API_BASE}/opportunities/import-template`,
  opportunitiesExportUrl: () => `${API_BASE}/opportunities/export`,
  downloadOpportunitiesTemplate: () =>
    authDownload('/opportunities/import-template', 'opportunities-import-template.xlsx'),
  downloadOpportunitiesExport: () =>
    authDownload('/opportunities/export', 'opportunities.xlsx'),

  opportunities: (filter: { ownerId?: string; stage?: OpportunityStage; serviceOrProduct?: string } = {}) => {
    const p = new URLSearchParams()
    if (filter.ownerId) p.set('ownerId', filter.ownerId)
    if (filter.stage) p.set('stage', filter.stage)
    if (filter.serviceOrProduct) p.set('serviceOrProduct', filter.serviceOrProduct)
    const qs = p.toString()
    return request<OpportunityDto[]>(`/opportunities${qs ? `?${qs}` : ''}`)
  },
  opportunity: (id: string) => request<OpportunityDto>(`/opportunities/${id}`),
  createOpportunity: (data: CreateOpportunityDto) =>
    request<OpportunityDto>('/opportunities', { method: 'POST', body: JSON.stringify(data) }),
  updateOpportunity: (id: string, data: UpdateOpportunityDto) =>
    request<OpportunityDto>(`/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  setOpportunityStage: (id: string, stage: OpportunityStage) =>
    request<OpportunityDto>(`/opportunities/${id}/stage`, { method: 'POST', body: JSON.stringify({ stage }) }),
  deleteOpportunity: (id: string) => request<void>(`/opportunities/${id}`, { method: 'DELETE' }),
  forecast: () => request<ForecastDto>('/opportunities/forecast'),

  // ─────── Activities ───────
  activities: (filter: { from?: Date; to?: Date; ownerId?: string; customerId?: string; opportunityId?: string } = {}) => {
    const p = new URLSearchParams()
    if (filter.from) p.set('from', filter.from.toISOString())
    if (filter.to) p.set('to', filter.to.toISOString())
    if (filter.ownerId) p.set('ownerId', filter.ownerId)
    if (filter.customerId) p.set('customerId', filter.customerId)
    if (filter.opportunityId) p.set('opportunityId', filter.opportunityId)
    const qs = p.toString()
    return request<ActivityDto[]>(`/activities${qs ? `?${qs}` : ''}`)
  },
  activity: (id: string) => request<ActivityDto>(`/activities/${id}`),
  createActivity: (data: CreateActivityDto) =>
    request<ActivityDto>('/activities', { method: 'POST', body: JSON.stringify(data) }),
  updateActivity: (id: string, data: UpdateActivityDto) =>
    request<ActivityDto>(`/activities/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteActivity: (id: string) => request<void>(`/activities/${id}`, { method: 'DELETE' }),

  // ─────── Quotations ───────
  quotations: () => request<QuotationDto[]>('/quotations'),
  quotation: (id: string) => request<QuotationDto>(`/quotations/${id}`),
  createQuotation: (data: CreateQuotationDto) => request<QuotationDto>('/quotations', { method: 'POST', body: JSON.stringify(data) }),
  addQuotationVersion: (id: string, data: CreateVersionDto) =>
    request<QuotationDto>(`/quotations/${id}/versions`, { method: 'POST', body: JSON.stringify(data) }),
  submitQuotation: (id: string) => request<QuotationDto>(`/quotations/${id}/submit`, { method: 'POST' }),
  approveQuotation: (id: string, comment?: string) =>
    request<QuotationDto>(`/quotations/${id}/approve`, { method: 'POST', body: JSON.stringify({ comment }) }),
  rejectQuotation: (id: string, comment: string) =>
    request<QuotationDto>(`/quotations/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) }),
  sendQuotation: (id: string, options: { toEmail?: string; ccEmails?: string[] } = {}) =>
    request<QuotationDto>(`/quotations/${id}/send`, { method: 'POST', body: JSON.stringify(options) }),
  quotationPdfUrl: (id: string) => `${API_BASE}/quotations/${id}/pdf`,

  // ─────── Documents ───────
  documents: (filter: { customerId?: string; opportunityId?: string; quotationId?: string; contractId?: string; category?: string; service?: string; isCentral?: boolean; q?: string } = {}) => {
    const p = new URLSearchParams()
    if (filter.customerId) p.set('customerId', filter.customerId)
    if (filter.opportunityId) p.set('opportunityId', filter.opportunityId)
    if (filter.quotationId) p.set('quotationId', filter.quotationId)
    if (filter.contractId) p.set('contractId', filter.contractId)
    if (filter.category) p.set('category', filter.category)
    if (filter.service) p.set('service', filter.service)
    if (typeof filter.isCentral === 'boolean') p.set('isCentral', String(filter.isCentral))
    if (filter.q) p.set('q', filter.q)
    const qs = p.toString()
    return request<DocumentDto[]>(`/documents${qs ? `?${qs}` : ''}`)
  },
  document: (id: string) => request<DocumentDto>(`/documents/${id}`),
  uploadDocument: (file: File, meta: {
    name?: string; description?: string
    customerId?: string; opportunityId?: string; quotationId?: string; contractId?: string
    category?: DocumentCategory
    serviceLines?: string[]; isCentral?: boolean; versionNotes?: string
  } = {}) => {
    const form = new FormData()
    form.append('file', file)
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined || v === null) continue
      if (Array.isArray(v)) form.append(k, v.join(','))
      else if (typeof v === 'boolean') form.append(k, String(v))
      else form.append(k, v)
    }
    return request<DocumentDto>('/documents', { method: 'POST', body: form })
  },
  createDocumentLink: (data: {
    name: string; url: string; description?: string
    category?: DocumentCategory
    customerId?: string; opportunityId?: string; quotationId?: string; contractId?: string
    serviceLines?: string[]; isCentral?: boolean
  }) => request<DocumentDto>('/documents/link', { method: 'POST', body: JSON.stringify(data) }),
  uploadDocumentVersion: (id: string, file: File, opts: { notes?: string } = {}) => {
    const form = new FormData()
    form.append('file', file)
    if (opts.notes) form.append('notes', opts.notes)
    return request<DocumentDto>(`/documents/${id}/versions`, { method: 'POST', body: form })
  },
  makeDocumentVersionCurrent: (documentId: string, versionId: string) =>
    request<DocumentDto>(`/documents/${documentId}/versions/${versionId}/make-current`, { method: 'POST' }),
  deleteDocumentVersion: (documentId: string, versionId: string) =>
    request<DocumentDto>(`/documents/${documentId}/versions/${versionId}`, { method: 'DELETE' }),
  updateDocument: (id: string, data: {
    name?: string; description?: string | null; category?: DocumentCategory
    serviceLines?: string[]; isCentral?: boolean
  }) => request<DocumentDto>(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
  documentDownloadUrl: (versionId: string) => `${API_BASE}/documents/versions/${versionId}/download`,
  /**
   * Fetch a document version as a Blob with the Bearer token attached. Used by
   * DocumentViewer to build a same-origin `blob:` URL — the raw download URL
   * cannot be embedded in an <iframe>/<img> across origins (helmet's
   * X-Frame-Options), and would 401 anyway since <iframe src> can't carry the
   * Authorization header.
   */
  documentVersionBlob: async (versionId: string): Promise<Blob> => {
    const headers = new Headers()
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(`${API_BASE}/documents/versions/${versionId}/download`, { headers, credentials: 'include' })
    if (!res.ok) {
      let msg = res.statusText
      try {
        const body = (await res.json()) as { message?: string | string[] }
        if (body.message) msg = Array.isArray(body.message) ? body.message.join(', ') : body.message
      } catch { /* not JSON */ }
      throw new ApiError(res.status, msg)
    }
    return res.blob()
  },

  // ─────── Contracts ───────
  contracts: (filter: { status?: string | string[]; customerId?: string; service?: string | string[]; q?: string } = {}) => {
    const p = new URLSearchParams()
    const statusCsv = Array.isArray(filter.status) ? filter.status.join(',') : filter.status
    const serviceCsv = Array.isArray(filter.service) ? filter.service.join(',') : filter.service
    if (statusCsv) p.set('status', statusCsv)
    if (filter.customerId) p.set('customerId', filter.customerId)
    if (serviceCsv) p.set('service', serviceCsv)
    if (filter.q) p.set('q', filter.q)
    const qs = p.toString()
    return request<ContractDto[]>(`/contracts${qs ? `?${qs}` : ''}`)
  },
  contract: (id: string) => request<ContractDto>(`/contracts/${id}`),
  contractDashboard: (filter: { status?: string | string[]; service?: string | string[]; q?: string } = {}) => {
    const p = new URLSearchParams()
    const statusCsv = Array.isArray(filter.status) ? filter.status.join(',') : filter.status
    const serviceCsv = Array.isArray(filter.service) ? filter.service.join(',') : filter.service
    if (statusCsv) p.set('status', statusCsv)
    if (serviceCsv) p.set('service', serviceCsv)
    if (filter.q) p.set('q', filter.q)
    const qs = p.toString()
    return request<ContractDashboardDto>(`/contracts/dashboard${qs ? `?${qs}` : ''}`)
  },
  contractTemplates: () => request<ContractTemplateDto[]>('/contract-templates'),
  contractTypes: (includeInactive = false) =>
    request<ContractTypeDto[]>(`/contract-types${includeInactive ? '?includeInactive=1' : ''}`),
  createContractType: (data: CreateContractTypeDto) =>
    request<ContractTypeDto>('/contract-types', { method: 'POST', body: JSON.stringify(data) }),
  updateContractType: (id: string, data: UpdateContractTypeDto) =>
    request<ContractTypeDto>(`/contract-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteContractType: (id: string) => request<void>(`/contract-types/${id}`, { method: 'DELETE' }),
  industryTypes: (includeInactive = false) =>
    request<IndustryTypeDto[]>(`/industry-types${includeInactive ? '?includeInactive=1' : ''}`),
  createIndustryType: (data: CreateIndustryTypeDto) =>
    request<IndustryTypeDto>('/industry-types', { method: 'POST', body: JSON.stringify(data) }),
  updateIndustryType: (id: string, data: UpdateIndustryTypeDto) =>
    request<IndustryTypeDto>(`/industry-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteIndustryType: (id: string) => request<void>(`/industry-types/${id}`, { method: 'DELETE' }),
  createContract: (data: CreateContractDto) => request<ContractDto>('/contracts', { method: 'POST', body: JSON.stringify(data) }),
  createContractFromTemplate: (data: CreateContractFromTemplateDto) =>
    request<ContractDto>('/contracts/from-template', { method: 'POST', body: JSON.stringify(data) }),
  updateContract: (id: string, data: UpdateContractDto) =>
    request<ContractDto>(`/contracts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  submitContract: (id: string) => request<ContractDto>(`/contracts/${id}/submit`, { method: 'POST' }),
  approveContract: (id: string, comment?: string) =>
    request<ContractDto>(`/contracts/${id}/approve`, { method: 'POST', body: JSON.stringify({ comment }) }),
  rejectContract: (id: string, comment: string) =>
    request<ContractDto>(`/contracts/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) }),
  terminateContract: (id: string, comment: string) =>
    request<ContractDto>(`/contracts/${id}/terminate`, { method: 'POST', body: JSON.stringify({ comment }) }),
  renewContract: (id: string, data: { newStart: string; newEnd: string; newValue?: number }) =>
    request<ContractDto>(`/contracts/${id}/renew`, { method: 'POST', body: JSON.stringify(data) }),

  obligations: (filter: { from?: Date; to?: Date; status?: string; contractId?: string; contractStatus?: string | string[]; contractService?: string | string[]; q?: string } = {}) => {
    const p = new URLSearchParams()
    if (filter.from) p.set('from', filter.from.toISOString())
    if (filter.to) p.set('to', filter.to.toISOString())
    if (filter.status) p.set('status', filter.status)
    if (filter.contractId) p.set('contractId', filter.contractId)
    const csCsv = Array.isArray(filter.contractStatus) ? filter.contractStatus.join(',') : filter.contractStatus
    const svCsv = Array.isArray(filter.contractService) ? filter.contractService.join(',') : filter.contractService
    if (csCsv) p.set('contractStatus', csCsv)
    if (svCsv) p.set('contractService', svCsv)
    if (filter.q) p.set('q', filter.q)
    const qs = p.toString()
    return request<ObligationDto[]>(`/obligations${qs ? `?${qs}` : ''}`)
  },
  createObligation: (contractId: string, data: CreateObligationDto) =>
    request<ObligationDto>(`/contracts/${contractId}/obligations`, { method: 'POST', body: JSON.stringify(data) }),
  completeObligation: (id: string) => request<ObligationDto>(`/obligations/${id}/complete`, { method: 'POST' }),
  deleteObligation: (id: string) => request<void>(`/obligations/${id}`, { method: 'DELETE' }),

  // ─────── Inbox ───────
  inboxThreads: () => request<import('@bluefish/shared').InboxThreadDto[]>('/inbox/threads'),
  inboxThread: (id: string) => request<import('@bluefish/shared').InboxThreadDto>(`/inbox/threads/${id}`),
  inboxMessages: (threadId: string) => request<import('@bluefish/shared').InboxMessageDto[]>(`/inbox/threads/${threadId}/messages`),
  sendInboxMessage: (threadId: string, text: string) =>
    request<import('@bluefish/shared').InboxMessageDto>(`/inbox/threads/${threadId}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),
  // ─────── Notifications ───────
  notifications: () => request<import('@bluefish/shared').NotificationDto[]>('/notifications'),
  markNotificationRead: (key: string) =>
    request<void>(`/notifications/${encodeURIComponent(key)}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request<void>('/notifications/read-all', { method: 'POST' }),
  // ─────── WebAuthn ───────
  webauthnRegisterOptions: () => request<import('@simplewebauthn/browser').PublicKeyCredentialCreationOptionsJSON>('/auth/webauthn/register/options', { method: 'POST', body: '{}' }),
  webauthnRegisterVerify: (data: { response: unknown; deviceLabel?: string }) =>
    request<{ verified: boolean }>('/auth/webauthn/register/verify', { method: 'POST', body: JSON.stringify(data) }),
  webauthnAuthOptions: (email: string) =>
    request<{ options: import('@simplewebauthn/browser').PublicKeyCredentialRequestOptionsJSON; hasCredentials: boolean }>('/auth/webauthn/authenticate/options', { method: 'POST', body: JSON.stringify({ email }) }),
  webauthnAuthVerify: (data: { email: string; response: unknown }) =>
    request<LoginResponse>('/auth/webauthn/authenticate/verify', { method: 'POST', body: JSON.stringify(data) }),
  webauthnListCredentials: () =>
    request<Array<{ id: string; deviceLabel: string | null; transports: string[]; createdAt: string; lastUsedAt: string | null }>>('/auth/webauthn/credentials'),
  webauthnDeleteCredential: (id: string) =>
    request<void>(`/auth/webauthn/credentials/${id}`, { method: 'DELETE' }),

  // ─────── Global search ───────
  globalSearch: (q: string) =>
    request<import('@bluefish/shared').GlobalSearchResultDto>(`/search?q=${encodeURIComponent(q)}`),

  // ─────── FlowAccount ───────
  flowaccountStatus: () => request<import('@bluefish/shared').FlowaccountStatusDto>('/integrations/flowaccount/status'),
  flowaccountPush: (quotationId: string) =>
    request<import('@bluefish/shared').FlowaccountPushResultDto>(`/integrations/flowaccount/quotations/${quotationId}/push`, { method: 'POST' }),
  flowaccountSync: (quotationId: string) =>
    request<import('@bluefish/shared').FlowaccountSyncResultDto>(`/integrations/flowaccount/quotations/${quotationId}/sync`, { method: 'POST' }),

  // ─────── Competitor Tracker ───────
  competitors: (filter: { service?: string } = {}) => {
    const p = new URLSearchParams()
    if (filter.service) p.set('service', filter.service)
    const qs = p.toString()
    return request<import('@bluefish/shared').CompetitorDto[]>(`/competitors${qs ? `?${qs}` : ''}`)
  },
  createCompetitor: (data: import('@bluefish/shared').CreateCompetitorDto) =>
    request<import('@bluefish/shared').CompetitorDto>('/competitors', { method: 'POST', body: JSON.stringify(data) }),
  updateCompetitor: (id: string, data: import('@bluefish/shared').UpdateCompetitorDto) =>
    request<import('@bluefish/shared').CompetitorDto>(`/competitors/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCompetitor: (id: string) => request<void>(`/competitors/${id}`, { method: 'DELETE' }),
  competitorContracts: (filter: { competitorId?: string; status?: string } = {}) => {
    const qs = new URLSearchParams()
    if (filter.competitorId) qs.set('competitorId', filter.competitorId)
    if (filter.status) qs.set('status', filter.status)
    const s = qs.toString()
    return request<import('@bluefish/shared').CompetitorContractDto[]>(`/competitor-contracts${s ? `?${s}` : ''}`)
  },
  createCompetitorContract: (data: import('@bluefish/shared').CreateCompetitorContractDto) =>
    request<import('@bluefish/shared').CompetitorContractDto>('/competitor-contracts', { method: 'POST', body: JSON.stringify(data) }),
  updateCompetitorContract: (id: string, data: import('@bluefish/shared').UpdateCompetitorContractDto) =>
    request<import('@bluefish/shared').CompetitorContractDto>(`/competitor-contracts/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCompetitorContract: (id: string) => request<void>(`/competitor-contracts/${id}`, { method: 'DELETE' }),

  markInboxRead: (threadId: string) =>
    request<import('@bluefish/shared').InboxThreadDto>(`/inbox/threads/${threadId}/read`, { method: 'PATCH' }),
  assignInboxThread: (threadId: string, ownerId: string | null) =>
    request<import('@bluefish/shared').InboxThreadDto>(`/inbox/threads/${threadId}/assign`, { method: 'PATCH', body: JSON.stringify({ ownerId }) }),
  linkInboxThread: (threadId: string, customerId: string) =>
    request<import('@bluefish/shared').InboxThreadDto>(`/inbox/threads/${threadId}/link`, { method: 'PATCH', body: JSON.stringify({ customerId }) }),

  // ─────── Integrations ───────
  apiKeys: () => request<import('@bluefish/shared').ApiKeyDto[]>('/integrations/api-keys'),
  createApiKey: (name: string, scopes: string[]) =>
    request<import('@bluefish/shared').CreatedApiKeyDto>('/integrations/api-keys', { method: 'POST', body: JSON.stringify({ name, scopes }) }),
  revokeApiKey: (id: string) => request<void>(`/integrations/api-keys/${id}`, { method: 'DELETE' }),
  apiKeyScopes: () => request<string[]>('/integrations/api-keys/available-scopes'),
  webhookSubs: () => request<import('@bluefish/shared').WebhookSubscriptionDto[]>('/integrations/webhooks'),
  createWebhookSub: (url: string, events: string[]) =>
    request<import('@bluefish/shared').WebhookSubscriptionDto>('/integrations/webhooks', { method: 'POST', body: JSON.stringify({ url, events }) }),
  deleteWebhookSub: (id: string) => request<void>(`/integrations/webhooks/${id}`, { method: 'DELETE' }),
  webhookEvents: () => request<string[]>('/integrations/webhooks/available-events'),
  pushPublicKey: () => request<{ publicKey: string | null }>('/integrations/push/public-key'),
  pushSubscribe: (payload: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }) =>
    request<{ id: string }>('/integrations/push/subscribe', { method: 'POST', body: JSON.stringify(payload) }),
  pushUnsubscribe: (endpoint: string) =>
    request<void>('/integrations/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  pushTest: (title: string, body: string) =>
    request<{ sent: number; skipped: number }>('/integrations/push/test', { method: 'POST', body: JSON.stringify({ title, body }) }),
  calendarAccounts: () => request<import('@bluefish/shared').CalendarAccountDto[]>('/integrations/calendar/accounts'),
  calendarMicrosoftStatus: () => request<{ configured: boolean }>('/integrations/calendar/microsoft/status'),
  calendarMicrosoftAuthorizeUrl: () =>
    request<{ url: string }>('/integrations/calendar/microsoft/authorize-url', { method: 'POST' }),
  linkCalendar: (payload: { provider: 'microsoft' | 'google'; externalId: string; email: string; accessToken: string }) =>
    request<import('@bluefish/shared').CalendarAccountDto>('/integrations/calendar/accounts/link', { method: 'POST', body: JSON.stringify(payload) }),
  syncCalendar: (id: string) =>
    request<import('@bluefish/shared').CalendarSyncResultDto>(`/integrations/calendar/accounts/${id}/sync`, { method: 'POST' }),
  resyncActivity: (id: string) =>
    request<import('@bluefish/shared').ActivityDto>(`/activities/${id}/resync`, { method: 'POST' }),
  disconnectCalendar: (id: string) =>
    request<void>(`/integrations/calendar/accounts/${id}`, { method: 'DELETE' }),
  sendForSignature: (contractId: string, signerEmail: string, signerName: string) =>
    request<import('@bluefish/shared').EnvelopeDto>(`/esign/contracts/${contractId}/send`, { method: 'POST', body: JSON.stringify({ signerEmail, signerName }) }),
  esignEnvelopes: (contractId: string) =>
    request<import('@bluefish/shared').EnvelopeDto[]>(`/esign/contracts/${contractId}`),

  // ─────── Dashboards ───────
  execDashboard: (filter: { serviceOrProduct?: string; ownerId?: string } = {}) =>
    request<import('@bluefish/shared').ExecutiveDashboardDto>(`/dashboards/executive${dashQs(filter)}`),
  salesDashboard: (filter: { serviceOrProduct?: string; ownerId?: string } = {}) =>
    request<import('@bluefish/shared').SalesDashboardDto>(`/dashboards/sales${dashQs(filter)}`),
  pipelineDashboard: (filter: { serviceOrProduct?: string; ownerId?: string } = {}) =>
    request<import('@bluefish/shared').PipelineDashboardDto>(`/dashboards/pipeline${dashQs(filter)}`),
  revenueDashboard: (filter: { serviceOrProduct?: string; ownerId?: string } = {}) =>
    request<import('@bluefish/shared').RevenueDashboardDto>(`/dashboards/revenue${dashQs(filter)}`),
  byServiceDashboard: (period?: string, filter: { serviceOrProduct?: string; ownerId?: string } = {}) =>
    request<import('@bluefish/shared').ByServiceDashboardDto>(`/dashboards/by-service${dashQs({ ...filter, period })}`),
  salesTargets: (period?: string) =>
    request<import('@bluefish/shared').SalesTargetDto[]>(`/sales-targets${period ? `?period=${period}` : ''}`),
  setSalesTarget: (service: string, period: string, amount: number) =>
    request<import('@bluefish/shared').SalesTargetDto>(`/sales-targets/${encodeURIComponent(service)}`, {
      method: 'PUT', body: JSON.stringify({ period, amount }),
    }),

  // ─────── Reports ───────
  reports: () => request<import('@bluefish/shared').ReportDefinitionDto[]>('/reports'),
  runReport: (key: string, filters: Record<string, string> = {}) =>
    request<import('@bluefish/shared').ReportResultDto>(`/reports/${key}/run`, { method: 'POST', body: JSON.stringify({ filters }) }),
  exportReport: async (key: string, format: 'xlsx' | 'pdf' | 'docx', filters: Record<string, string> = {}) => {
    const headers = new Headers()
    headers.set('Content-Type', 'application/json')
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(`${API_BASE}/reports/${key}/export?format=${format}`, {
      method: 'POST', headers, body: JSON.stringify({ filters }), credentials: 'include',
    })
    if (!res.ok) throw new ApiError(res.status, res.statusText)
    const disposition = res.headers.get('Content-Disposition') ?? ''
    const nameMatch = disposition.match(/filename="([^"]+)"/)
    const filename = nameMatch ? nameMatch[1] : `${key}.${format}`
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
  reportSchedules: () => request<import('@bluefish/shared').ReportScheduleDto[]>('/report-schedules'),
  createReportSchedule: (data: import('@bluefish/shared').CreateReportScheduleDto) =>
    request<import('@bluefish/shared').ReportScheduleDto>('/report-schedules', { method: 'POST', body: JSON.stringify(data) }),
  toggleReportSchedule: (id: string, isActive: boolean) =>
    request<import('@bluefish/shared').ReportScheduleDto>(`/report-schedules/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  deleteReportSchedule: (id: string) => request<void>(`/report-schedules/${id}`, { method: 'DELETE' }),
  runScheduleNow: (id: string) => request<{ recipients: number; bytes: number }>(`/report-schedules/${id}/run`, { method: 'POST' }),

  // ─────── AI ───────
  aiAgents: () => request<import('@bluefish/shared').AiAgentDto[]>('/ai/agents'),
  aiRun: (agentKey: string, input: Record<string, unknown> = {}, isDryRun?: boolean) =>
    request<import('@bluefish/shared').AiRunDto>(`/ai/agents/${agentKey}/run`, { method: 'POST', body: JSON.stringify({ input, isDryRun }) }),
  aiRuns: (filter: { agentKey?: string; limit?: number } = {}) => {
    const p = new URLSearchParams()
    if (filter.agentKey) p.set('agentKey', filter.agentKey)
    if (filter.limit) p.set('limit', String(filter.limit))
    const qs = p.toString()
    return request<import('@bluefish/shared').AiRunDto[]>(`/ai/runs${qs ? `?${qs}` : ''}`)
  },
  aiReviewQueue: (agentKey?: string) =>
    request<import('@bluefish/shared').AiResultDto[]>(`/ai/review-queue${agentKey ? `?agentKey=${agentKey}` : ''}`),
  aiReview: (id: string, decision: 'accept' | 'reject', comment?: string) =>
    request<import('@bluefish/shared').AiResultDto>(`/ai/review-queue/${id}/review`, { method: 'POST', body: JSON.stringify({ decision, comment }) }),
  aiCost: () => request<import('@bluefish/shared').AiCostSummaryDto>('/ai/cost-summary'),

  // ─────── Channel integrations (Inbox config) ───────
  channelIntegrations: () =>
    request<import('@bluefish/shared').ChannelIntegrationDto[]>('/integrations/channels'),
  upsertChannelIntegration: (channel: string, data: import('@bluefish/shared').UpsertChannelIntegrationDto) =>
    request<import('@bluefish/shared').ChannelIntegrationDto>(`/integrations/channels/${encodeURIComponent(channel)}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),
  deleteChannelIntegration: (channel: string) =>
    request<{ ok: true }>(`/integrations/channels/${encodeURIComponent(channel)}`, { method: 'DELETE' }),

  /**
   * Scan a business card. Pass `front` alone for one-sided, or `front + back`
   * when the card carries info on both sides. Backend runs vision on each and
   * merges (picks the richer value per field, concatenates notes).
   */
  scanCard: (front: File, back?: File | null) => {
    const form = new FormData()
    form.append('files', front)
    if (back) form.append('files', back)
    return request<import('@bluefish/shared').ScanCardResultDto>('/ai/scan-card', { method: 'POST', body: form })
  },
  /** Parse pre-OCR'd text (from Google Lens / iOS Live Text / clipboard). */
  parseCardText: (text: string) =>
    request<import('@bluefish/shared').ScanCardResultDto>('/ai/parse-card-text', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  getScanCardConfig: () =>
    request<{
      activeProvider: 'anthropic' | 'tesseract' | 'mock'
      anthropicKeyPresent: boolean
      anthropicKeySource: 'db' | 'env' | null
      tesseractReady: boolean
    }>('/ai/scan-card/config'),

  /** Pass empty string / null to clear the DB override (env value wins again). */
  updateScanCardConfig: (anthropicApiKey: string | null) =>
    request<{
      activeProvider: 'anthropic' | 'tesseract' | 'mock'
      anthropicKeyPresent: boolean
      anthropicKeySource: 'db' | 'env' | null
      tesseractReady: boolean
    }>('/ai/scan-card/config', {
      method: 'PUT',
      body: JSON.stringify({ anthropicApiKey }),
    }),

  auditLogs: (filter: { entity?: string; entityId?: string; userId?: string; limit?: number } = {}) => {
    const params = new URLSearchParams()
    if (filter.entity) params.set('entity', filter.entity)
    if (filter.entityId) params.set('entityId', filter.entityId)
    if (filter.userId) params.set('userId', filter.userId)
    if (filter.limit) params.set('limit', String(filter.limit))
    const qs = params.toString()
    return request<import('@bluefish/shared').AuditLogDto[]>(`/audit-logs${qs ? `?${qs}` : ''}`)
  },
}

export { API_BASE }
