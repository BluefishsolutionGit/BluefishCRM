// Shared DTOs and enums used by both @bluefish/web and @bluefish/api

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  user: UserDto
}

export interface MfaChallengeResponse {
  requiresMfa: true
  mfaToken: string
}

export type LoginOutcome = LoginResponse | MfaChallengeResponse

export function isMfaChallenge(outcome: LoginOutcome): outcome is MfaChallengeResponse {
  return 'requiresMfa' in outcome && outcome.requiresMfa === true
}

export interface UserDto {
  id: string
  email: string
  name: string
  role: string
  department?: string | null
  services?: string[]
  isActive?: boolean
  /** IANA timezone name (e.g. "Asia/Bangkok"). Used when pushing activities to Outlook. */
  timezone?: string
  /** List of permission keys the user's role grants (e.g. "customer:read"). */
  permissions?: string[]
}

export type UserRole =
  | 'admin'
  | 'sales_manager'
  | 'sales_rep'
  | 'legal'
  | 'finance'
  | 'auditor'
  | 'viewer'

export interface RoleDto {
  name: string
  description: string
  permissions: string[]
}

export interface CreateUserDto {
  email: string
  name: string
  role: string
  password: string
  department?: string | null
  services?: string[]
}

export interface UpdateUserDto {
  name?: string
  role?: string
  department?: string | null
  services?: string[]
  isActive?: boolean
}

export interface AdminResetPasswordDto {
  newPassword: string
}

export type CustomerStatus = 'Active' | 'Prospect' | 'Inactive'

export interface CustomerDto {
  id: string
  code: string
  name: string
  nameTh: string | null
  industry: string
  status: CustomerStatus
  ownerId: string
  ownerName: string
  city: string
  address: string
  taxId: string
  phone: string
  terms: string
  openValue: number
  wonValue: number
  lastActivity: string
  tags: TagDto[]
}

export interface ContactDto {
  id: string
  customerId: string
  name: string
  firstName: string | null
  lastName: string | null
  nickname: string | null
  role: string
  position: string | null
  department: string | null
  email: string
  phone: string
  telephone: string | null
  lineId: string | null
  notes: string | null
  isPrimary: boolean
}

/** Slim result for the global contact-search autocomplete — includes customer name for context. */
export interface ContactSearchResultDto {
  id: string
  name: string
  email: string
  customerId: string
  customerName: string
}

// ─── Tags ─────────────────────────────────────────────────
export type TagKind = 'department' | 'priority' | 'industry' | 'custom'
export interface TagDto {
  id: string
  name: string
  color: string
  kind: TagKind
  description: string | null
  usageCount?: number
}
export interface CreateTagDto {
  name: string
  color?: string
  kind?: TagKind
  description?: string
}
export interface UpdateTagDto {
  name?: string
  color?: string
  kind?: TagKind
  description?: string | null
}

export interface CreateCustomerDto {
  code: string
  name: string
  nameTh?: string | null
  industry: string
  status?: CustomerStatus
  ownerId: string
  city: string
  address: string
  taxId: string
  phone: string
  terms: string
  openValue?: number
  wonValue?: number
  lastActivity?: string
  tagIds?: string[]
}

export interface UpdateCustomerDto {
  code?: string
  name?: string
  nameTh?: string | null
  industry?: string
  status?: CustomerStatus
  ownerId?: string
  city?: string
  address?: string
  taxId?: string
  phone?: string
  terms?: string
  openValue?: number
  wonValue?: number
  lastActivity?: string
  tagIds?: string[]
}

export interface CreateContactDto {
  name?: string
  firstName?: string
  lastName?: string
  nickname?: string
  role?: string
  position?: string
  department?: string
  email: string
  phone: string
  telephone?: string
  lineId?: string
  notes?: string
  isPrimary?: boolean
}

export interface UpdateContactDto {
  name?: string
  firstName?: string | null
  lastName?: string | null
  nickname?: string | null
  role?: string
  position?: string | null
  department?: string | null
  email?: string
  phone?: string
  telephone?: string | null
  lineId?: string | null
  notes?: string | null
  isPrimary?: boolean
}

export interface ImportResultDto {
  imported: number
  skipped: number
  errors: { row: number; field?: string; message: string }[]
}

// ─────── Leads ───────

export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'AI Sourced' | 'Converted' | 'Lost'

export interface LeadDto {
  id: string
  name: string
  companyName: string
  email: string | null
  phone: string | null
  source: string
  score: number
  ownerId: string | null
  ownerName: string | null
  status: LeadStatus
  estValue: number | null
  serviceOrProduct: string | null
  notes: string | null
  convertedAt: string | null
  convertedOpportunityId: string | null
  createdAt: string
}

export interface CreateLeadDto {
  name: string
  companyName: string
  email?: string
  phone?: string
  source: string
  ownerId?: string | null
  status?: LeadStatus
  estValue?: number
  serviceOrProduct?: string
  notes?: string
}

export interface UpdateLeadDto extends Partial<CreateLeadDto> {}

export interface DuplicateCheckResult {
  duplicates: Array<{ id: string; name: string; companyName: string; email: string | null; phone: string | null; similarity: number }>
}

export interface ConvertLeadDto {
  /** Existing customer to attach the new opportunity to. If omitted, a new customer stub is created from the company name. */
  customerId?: string
  /** Opportunity title (defaults to lead.companyName + source) */
  title?: string
  value?: number
  probability?: number
  closeDate?: string
}

// ─────── Products ───────

export interface ProductDto {
  id: string
  code: string
  name: string
  description: string | null
  unitPrice: number
  currency: string
  isActive: boolean
}

export interface CreateProductDto {
  code: string
  name: string
  description?: string
  unitPrice: number
  currency?: string
  isActive?: boolean
}

export interface UpdateProductDto extends Partial<CreateProductDto> {}

// ─────── Opportunities ───────

export type OpportunityStage = 'Qualification' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost'

export interface OpportunityLineDto {
  id: string
  productId: string
  productCode: string
  productName: string
  quantity: number
  unitPrice: number
  discount: number
  amount: number
}

/**
 * Canonical service pipelines that Bluefish tracks. Each opportunity belongs
 * to exactly one — the sales manager filters their pipeline by this to see
 * only deals in their service line. Sales reps may sell across multiple lines,
 * so this is NOT tied to the user.
 */
export const SERVICE_LINES = ['Box', '3S', '3D', 'AI&RPA'] as const
export type ServiceLine = (typeof SERVICE_LINES)[number]

export interface OpportunityDto {
  id: string
  title: string
  customerId: string
  customerName: string
  ownerId: string
  ownerName: string
  stage: OpportunityStage
  value: number
  probability: number
  closeDate: string | null
  bidDeadline: string | null
  decisionDate: string | null
  serviceOrProduct: string | null
  competitor: string | null
  lostReason: string | null
  wonReason: string | null
  managerHint: string | null
  notes: string | null
  lines: OpportunityLineDto[]
  createdAt: string
  updatedAt: string
}

export interface CreateOpportunityDto {
  title: string
  customerId: string
  ownerId: string
  stage?: OpportunityStage
  value?: number
  probability?: number
  closeDate?: string
  bidDeadline?: string
  decisionDate?: string
  serviceOrProduct?: string
  competitor?: string
  managerHint?: string
  notes?: string
}

export interface UpdateOpportunityDto extends Partial<CreateOpportunityDto> {
  lostReason?: string
  wonReason?: string
}

export interface ForecastDto {
  quota: number
  closed: number
  commit: number
  bestCase: number
  pipeline: number
  weighted: number
  attainmentPct: number
  byRep: Array<{ ownerId: string; ownerName: string; closed: number; commit: number; bestCase: number; pipeline: number; total: number }>
}

// ─────── Activities ───────

export type ActivityType = 'meeting' | 'call' | 'visit' | 'demo' | 'task' | 'follow_up' | 'email'
export type ActivityStatus = 'scheduled' | 'completed' | 'cancelled'

/** Outlook attendee response values — mirrors Graph attendee.status.response. */
export type AttendeeResponse = 'none' | 'organizer' | 'tentativelyAccepted' | 'accepted' | 'declined' | 'notResponded'

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

/**
 * Recurrence pattern for a series. MVP supports daily/weekly/monthly-absolute with an end
 * date; range 'noEnd' and 'numbered' aren't exposed yet. Weekly falls back to the weekday
 * of scheduledAt if daysOfWeek is empty.
 */
export interface RecurrencePatternDto {
  type: 'daily' | 'weekly' | 'monthly'
  interval: number  // every N days/weeks/months (>= 1)
  daysOfWeek?: DayOfWeek[]
  endDate: string  // YYYY-MM-DD
}

export interface AttendeeDto {
  email: string
  name?: string | null
  response?: AttendeeResponse | null
  /** Set when this email matches a CRM Contact — lets the UI link straight to the contact. */
  contactId?: string | null
  contactName?: string | null
}

/** Accepted input shapes: bare email, or a rich {email, name?, response?, contactId?}. Both normalised server-side. */
export type AttendeeInput = string | { email: string; name?: string; response?: AttendeeResponse; contactId?: string | null }

export interface ActivityDto {
  id: string
  type: ActivityType
  title: string
  description: string | null
  scheduledAt: string
  durationMin: number | null
  ownerId: string
  ownerName: string
  customerId: string | null
  customerName: string | null
  opportunityId: string | null
  opportunityTitle: string | null
  /** Denormalised from linked opportunity — enables service-line filtering on the Activities page without extra fetches */
  opportunityServiceOrProduct: string | null
  status: ActivityStatus
  location: string | null
  meetingLink: string | null
  notes: string | null
  attendees: AttendeeDto[]
  /** True when this activity mirrors an Outlook event (either imported or pushed). */
  linkedToCalendar: boolean
  /** Timestamp of the most recent Graph write (inbound or outbound). Null until first sync. */
  calendarSyncedAt: string | null
  /** Recurrence pattern — null for one-off events. Only outbound is supported for MVP. */
  recurrence: RecurrencePatternDto | null
  createdAt: string
}

export interface CreateActivityDto {
  type: ActivityType
  title: string
  description?: string
  scheduledAt: string
  durationMin?: number
  ownerId: string
  customerId?: string
  opportunityId?: string
  status?: ActivityStatus
  location?: string
  meetingLink?: string
  notes?: string
  attendees?: AttendeeInput[]
  recurrence?: RecurrencePatternDto | null
}

export interface UpdateActivityDto extends Partial<CreateActivityDto> {}

// ─────── Quotations ───────

export type QuotationStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'Sent'
  | 'Accepted'
  | 'Rejected'
  | 'Expired'

export interface QuotationLineDto {
  id: string
  productId: string | null
  productCode: string | null
  itemName: string
  description: string | null
  quantity: number
  unitPrice: number
  discountPct: number
  amount: number
  ordering: number
}

export interface QuotationVersionDto {
  id: string
  versionNo: number
  subtotal: number
  discountPct: number
  discountAmt: number
  vatPct: number
  vatAmt: number
  grandTotal: number
  terms: string
  notes: string | null
  createdAt: string
  createdByName: string
  lines: QuotationLineDto[]
}

export interface QuotationApprovalDto {
  id: string
  step: number
  stepName: string
  decision: 'pending' | 'approved' | 'rejected'
  approverId: string | null
  approverName: string | null
  decidedAt: string | null
  comment: string | null
}

export interface QuotationDto {
  id: string
  no: string
  customerId: string
  customerName: string
  opportunityId: string | null
  opportunityTitle: string | null
  ownerId: string
  ownerName: string
  status: QuotationStatus
  approvalStep: number
  currentVersion: QuotationVersionDto | null
  versions: Array<{ id: string; versionNo: number; createdAt: string }>
  approvals: QuotationApprovalDto[]
  sentAt: string | null
  flowaccountId: string | null
  flowaccountDocumentNumber: string | null
  flowaccountStatus: string | null
  flowaccountLastSyncedAt: string | null
  /** Deep-link to the FlowAccount web app page for this quotation. Null when
   *  the quotation hasn't been pushed yet. */
  flowaccountDeepLink: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateQuotationDto {
  customerId: string
  opportunityId?: string
  ownerId?: string
}

export interface CreateVersionDto {
  discountPct?: number
  vatPct?: number
  terms?: string
  notes?: string
  lines: Array<{
    productId?: string
    itemName: string
    description?: string
    quantity: number
    unitPrice: number
    discountPct?: number
  }>
}

export interface QuotationApproveDto { comment?: string }
export interface QuotationRejectDto { comment: string }
export interface SendQuotationDto { toEmail?: string; ccEmails?: string[] }

// ─────── Contracts ───────

export type ContractStatus =
  | 'Draft'
  | 'Under Review'
  | 'Pending Approval'
  | 'Approved'
  | 'Signed'
  | 'Active'
  | 'Expiring'
  | 'Expired'
  | 'Renewed'
  | 'Terminated'

export type RiskLevel = 'Low' | 'Med' | 'High'
export type ObligationKind = 'Payment' | 'Delivery' | 'SLA' | 'Renewal' | 'Warranty' | 'Insurance' | 'KPI'

export interface ContractTemplateDto {
  id: string
  code: string
  name: string
  type: string
  body: string
  variables: string[]
  isActive: boolean
}

export interface ContractVersionDto {
  id: string
  versionNo: number
  title: string
  body: string
  templateId: string | null
  createdAt: string
  createdByName: string
}

export interface ContractApprovalDto {
  id: string
  step: number
  stepName: string
  decision: 'pending' | 'approved' | 'rejected'
  approverId: string | null
  approverName: string | null
  decidedAt: string | null
  comment: string | null
}

export interface ObligationDto {
  id: string
  contractId: string
  contractNo: string
  kind: ObligationKind
  title: string
  dueDate: string
  amount: number | null
  status: 'pending' | 'completed' | 'overdue'
  completedAt: string | null
  notes: string | null
}

export interface ContractRiskFindingDto {
  id: string
  severity: 'low' | 'medium' | 'high'
  category: string
  message: string
  snippet: string | null
}

export interface ContractDto {
  id: string
  no: string
  customerId: string
  customerName: string
  opportunityId: string | null
  opportunityTitle: string | null
  ownerId: string
  ownerName: string
  type: string
  serviceLines: ServiceLine[]
  status: ContractStatus
  approvalStep: number
  value: number
  currency: string
  risk: RiskLevel
  startDate: string | null
  endDate: string | null
  signedAt: string | null
  terminatedAt: string | null
  autoRenew: boolean
  parentContractId: string | null
  daysLeft: number | null
  currentVersion: ContractVersionDto | null
  versions: Array<{ id: string; versionNo: number; createdAt: string }>
  approvals: ContractApprovalDto[]
  obligations: ObligationDto[]
  riskFindings: ContractRiskFindingDto[]
  createdAt: string
  updatedAt: string
}

export interface CreateContractFromTemplateDto {
  templateId: string
  customerId: string
  opportunityId?: string
  value?: number
  startDate?: string
  endDate?: string
  variables?: Record<string, string>
  autoRenew?: boolean
  serviceLines?: ServiceLine[]
}

export interface CreateContractDto {
  customerId: string
  opportunityId?: string
  type: string
  title?: string
  body?: string
  value?: number
  startDate?: string
  endDate?: string
  autoRenew?: boolean
  serviceLines?: ServiceLine[]
}

export interface UpdateContractDto {
  type?: string
  value?: number
  startDate?: string
  endDate?: string
  risk?: RiskLevel
  autoRenew?: boolean
  title?: string
  body?: string
  serviceLines?: ServiceLine[]
}

export interface CreateObligationDto {
  kind: ObligationKind
  title: string
  dueDate: string
  amount?: number
  notes?: string
}

export interface ContractDashboardDto {
  totalCount: number
  totalValue: number
  activeCount: number
  expiringCount: number
  pendingCount: number
  avgApprovalDays: number
  byStatus: Array<{ status: ContractStatus; count: number }>
  byType: Array<{ type: string; count: number; value: number }>
  upcomingObligations: ObligationDto[]
}

// ─────── Documents ───────

export type DocumentCategory = 'contract' | 'tor' | 'boq' | 'invoice' | 'quotation' | 'brochure' | 'other'

export interface DocumentVersionDto {
  id: string
  versionNo: number
  filename: string
  mimeType: string
  sizeBytes: number
  uploadedByName: string
  createdAt: string
  extraction?: DocumentExtractionDto | null
}

export interface DocumentExtractionDto {
  status: 'pending' | 'ready' | 'error'
  classification: string | null
  extractedText: string | null
  fields: Record<string, string | number | null> | null
  processedAt: string | null
}

export interface DocumentDto {
  id: string
  name: string
  category: DocumentCategory
  customerId: string | null
  customerName: string | null
  opportunityId: string | null
  quotationId: string | null
  contractId: string | null
  uploadedByName: string
  currentVersion: DocumentVersionDto | null
  versions: Array<{ id: string; versionNo: number; createdAt: string }>
  createdAt: string
  updatedAt: string
}

// ─────── AI Suite ───────

export type AiAgentKey =
  | 'lead_hunter'
  | 'sales_assistant'
  | 'meeting_assistant'
  | 'document_assistant'
  | 'forecast_assistant'

export interface AiAgentDto {
  key: AiAgentKey
  name: string
  description: string
  category: string
  needsInput: 'none' | 'customer' | 'document' | 'transcript' | 'query'
  enabled: boolean
  latestPromptVersion: number
}

export interface AiResultDto {
  id: string
  kind: string
  title: string
  payload: Record<string, unknown>
  reviewStatus: 'pending' | 'accepted' | 'rejected'
  reviewedAt: string | null
  createdCrmId: string | null
  createdCrmType: string | null
  createdAt: string
}

export interface AiRunDto {
  id: string
  agentKey: AiAgentKey
  userId: string | null
  userName: string | null
  status: 'pending' | 'running' | 'complete' | 'error'
  startedAt: string
  completedAt: string | null
  model: string | null
  tokensIn: number
  tokensOut: number
  costUsd: number
  isDryRun: boolean
  error: string | null
  summary: string | null
  promptVersion: number | null
  results: AiResultDto[]
}

export interface RunAgentDto {
  input?: Record<string, unknown>
}

export interface ReviewResultDto {
  decision: 'accept' | 'reject'
  comment?: string
}

export interface AiCostSummaryDto {
  totalRuns: number
  totalTokensIn: number
  totalTokensOut: number
  totalCostUsd: number
  byAgent: Array<{ agentKey: AiAgentKey; runs: number; tokensIn: number; tokensOut: number; costUsd: number }>
  byDay: Array<{ date: string; runs: number; costUsd: number }>
}

// ─────── Dashboards & Reports ───────

export interface ExecutiveDashboardDto {
  asOf: string
  openPipeline: number
  revenueMTD: number
  revenueQTD: number
  revenueYTD: number
  newLeadsPeriod: number
  dealsWonPeriod: number
  activeContracts: number
  expiringContracts: number
  pendingApprovals: number
  aiSpendUsd: number
  leadConversionRate: number
  avgDealSize: number
  topDeals: Array<{ id: string; title: string; customerName: string; value: number; stage: string; probability: number }>
  activityBreakdown: Array<{ type: string; count: number }>
}

export interface SalesTargetDto {
  service: string
  period: string  // 'YYYY'
  amount: number  // ฿ annual target
}

export interface ByServiceStatDto {
  service: string
  target: number     // 0 when the admin hasn't set one for this year
  won: number        // aggregate value of Won deals in the period
  count: number      // number of Won deals
  pctOfTarget: number // 0-100+; 100+ means over-hit
}

export interface MonthlyByServiceDto {
  month: string             // 'YYYY-MM'
  byService: Record<string, number>  // service → won revenue in that month
}

export interface ByServiceDashboardDto {
  period: string
  stats: ByServiceStatDto[]
  /** 12 months of the requested year (Jan → Dec). Zero-filled for months with no wins. */
  monthly: MonthlyByServiceDto[]
}

export interface SalesRepStatsDto {
  ownerId: string
  ownerName: string
  openDeals: number
  openValue: number
  wonDeals: number
  wonValue: number
  activitiesLastWeek: number
  leadsAssigned: number
}

export interface SalesDashboardDto {
  reps: SalesRepStatsDto[]
  quotaAttainment: number
  totalOpen: number
  totalWon: number
}

export interface PipelineDashboardDto {
  stages: Array<{ name: string; count: number; value: number }>
  weightedTotal: number
  avgCycleDays: number
  idleDeals: Array<{ id: string; title: string; customerName: string; daysIdle: number }>
}

export interface RevenueDashboardDto {
  monthly: Array<{ month: string; won: number }>
  bySource: Array<{ source: string; won: number; count: number }>
  byIndustry: Array<{ industry: string; won: number; count: number }>
}

export type ReportKey =
  | 'lead_conversion'
  | 'activity_summary'
  | 'opportunity_pipeline'
  | 'customer_overview'
  | 'contract_status'

export type ReportFormat = 'xlsx' | 'pdf' | 'docx'

export interface ReportDefinitionDto {
  key: ReportKey
  name: string
  description: string
  columns: Array<{ key: string; label: string; type: 'string' | 'number' | 'date' | 'currency' }>
  filters: Array<{ key: string; label: string; type: 'string' | 'date' | 'select'; options?: string[] }>
}

export interface ReportRowDto {
  values: Record<string, string | number | null>
}

export interface ReportResultDto {
  key: ReportKey
  generatedAt: string
  filters: Record<string, string>
  rows: ReportRowDto[]
  totals?: Record<string, number>
}

export interface ReportScheduleDto {
  id: string
  reportKey: ReportKey
  filters: Record<string, string> | null
  cron: string
  format: ReportFormat
  recipients: string[]
  isActive: boolean
  lastRunAt: string | null
  lastError: string | null
  createdAt: string
}

export interface CreateReportScheduleDto {
  reportKey: ReportKey
  filters?: Record<string, string>
  cron: string
  format?: ReportFormat
  recipients: string[]
}

// ─────── Inbox ───────

export type InboxChannel = 'LINE' | 'LINE OA' | 'Messenger' | 'Instagram' | 'WhatsApp' | 'Email'

export interface InboxMessageDto {
  id: string
  threadId: string
  direction: 'in' | 'out'
  text: string
  authorName: string | null
  sentAt: string
}

export interface InboxThreadDto {
  id: string
  channel: InboxChannel
  externalId: string
  name: string
  companyName: string | null
  customerId: string | null
  customerName: string | null
  ownerId: string | null
  ownerName: string | null
  tag: string | null
  unread: number
  lastMessageAt: string
  latestMessage: InboxMessageDto | null
  createdAt: string
}

export interface SendInboxMessageDto {
  text: string
}

// ─────── API keys / Webhooks ───────

export interface ApiKeyDto {
  id: string
  name: string
  prefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface CreateApiKeyDto {
  name: string
  scopes: string[]
}

export interface CreatedApiKeyDto extends ApiKeyDto {
  /** Full key — shown ONCE. Store safely. */
  key: string
}

export interface WebhookSubscriptionDto {
  id: string
  url: string
  events: string[]
  isActive: boolean
  lastDeliveryAt: string | null
  lastError: string | null
  createdAt: string
}

export interface CreateWebhookDto {
  url: string
  events: string[]
}

export interface PushSubscribeDto {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

// ─────── e-Signature ───────

export type EnvelopeStatus = 'sent' | 'viewed' | 'signed' | 'declined' | 'expired'

export interface EnvelopeDto {
  id: string
  contractId: string
  provider: string
  externalId: string
  signerEmail: string
  signerName: string
  status: EnvelopeStatus
  sentAt: string
  completedAt: string | null
  signUrl: string
}

export interface SendForSignatureDto {
  signerEmail: string
  signerName: string
}

// ─────── Calendar sync ───────

export interface CalendarAccountDto {
  id: string
  provider: 'microsoft' | 'google'
  email: string
  lastSyncedAt: string | null
  createdAt: string
}

export interface CalendarSyncResultDto {
  imported: number
  skipped: number
  errors: string[]
}

export interface AuditLogDto {
  id: string
  userId: string | null
  action: string
  entity: string | null
  entityId: string | null
  before: unknown
  after: unknown
  ip: string | null
  userAgent: string | null
  metadata: unknown
  createdAt: string
  user?: { id: string; email: string; name: string } | null
}

export interface ApiError {
  statusCode: number
  message: string
  error?: string
}

// ─── Notifications ──────────────────────────────────────────────────
export type NotificationKind = 'activity_upcoming' | 'activity_overdue' | 'quotation_approval' | 'inbox_message' | 'flowaccount_status' | 'attendee_declined' | 'attendee_tentative'
export type NotificationTone = 'ok' | 'warn' | 'bad' | 'info'

export interface NotificationDto {
  id: string
  kind: NotificationKind
  title: string
  sub: string
  tone: NotificationTone
  link: string
  at: string
  unread: boolean
}

// ─── Global search ──────────────────────────────────────────────────
export interface GlobalSearchResultDto {
  query: string
  customers: Array<{ id: string; code: string; name: string; industry: string }>
  leads: Array<{ id: string; name: string; companyName: string; status: string; score: number }>
  opportunities: Array<{ id: string; title: string; stage: string; value: number; customerName: string }>
  quotations: Array<{ id: string; no: string; status: string; customerName: string }>
  contracts: Array<{ id: string; no: string; status: string; customerName: string }>
}

// ─── FlowAccount integration ────────────────────────────────────────
export interface FlowaccountStatusDto {
  configured: boolean
  mode: 'stub' | 'live'
  baseUrl: string
  culture: string
  lastTokenAcquiredAt: string | null
  tokenExpiresAt: string | null
}

export interface FlowaccountPushResultDto {
  quotationId: string
  flowaccountId: string
  flowaccountDocumentNumber: string | null
  flowaccountStatus: string
  contactCode: string | null
  contactCreated: boolean
  pushedAt: string
  isStub: boolean
}

export interface FlowaccountSyncResultDto {
  quotationId: string
  flowaccountId: string
  previousStatus: string | null
  currentStatus: string
  syncedAt: string
  isStub: boolean
}

// ─── Competitor Tracker ─────────────────────────────────────────────
export type CompetitorContractStatus =
  | 'Prospect'
  | 'Contract Identified'
  | 'Monitoring'
  | 'Renewal Window'
  | 'Proposal Submitted'
  | 'Negotiation'
  | 'Auto Renewed'
  | 'Won'
  | 'Lost'

export type CompetitorConfidence = 'Low' | 'Med' | 'High'

export interface CompetitorDto {
  id: string
  name: string
  logo: string
  color: string
  notes: string | null
  metrics: {
    activeContracts: number
    expiringIn90Days: number
    renewedByThem: number
    inNegotiationVsUs: number
    totalDealValue: number
  }
  createdAt: string
  updatedAt: string
}

export interface CompetitorContractDto {
  id: string
  competitorId: string
  competitorName: string
  competitorLogo: string
  competitorColor: string
  customerId: string | null
  customerName: string
  service: string
  endDate: string
  daysUntilEnd: number
  status: CompetitorContractStatus
  probability: number
  dealValue: number
  ownerId: string | null
  ownerName: string | null
  ownerInitials: string | null
  confidence: CompetitorConfidence
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateCompetitorDto {
  name: string
  logo?: string
  color?: string
  notes?: string
}

export interface UpdateCompetitorDto {
  name?: string
  logo?: string
  color?: string
  notes?: string | null
}

export interface CreateCompetitorContractDto {
  competitorId: string
  customerId?: string | null
  customerName: string
  service: string
  endDate: string
  status?: CompetitorContractStatus
  probability?: number
  dealValue?: number
  ownerId?: string | null
  confidence?: CompetitorConfidence
  notes?: string
}

export interface UpdateCompetitorContractDto extends Partial<CreateCompetitorContractDto> {}

