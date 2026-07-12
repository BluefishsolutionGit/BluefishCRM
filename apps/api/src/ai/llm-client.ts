import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmCallInput {
  system: string
  messages: LlmMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  agentKey: string
}

export interface LlmCallOutput {
  text: string
  model: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  isDryRun: boolean
  fallbackReason?: string
}

// Pricing per 1M tokens, USD. Adjust as models evolve.
const PRICING: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7': { in: 15, out: 75 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
}

/**
 * Wraps Anthropic SDK. Falls back to deterministic mock when ANTHROPIC_API_KEY
 * is absent OR when `isDryRun` is set. Every call returns token counts + USD cost,
 * so the run tracker can aggregate spend.
 */
@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name)
  private client: Anthropic | null = null

  constructor(private cfg: ConfigService) {
    const key = cfg.get<string>('ANTHROPIC_API_KEY')
    if (key) this.client = new Anthropic({ apiKey: key })
  }

  hasApiKey(): boolean {
    return this.client !== null
  }

  async call(input: LlmCallInput, isDryRun = false): Promise<LlmCallOutput> {
    const model = input.model ?? this.cfg.get<string>('AI_DEFAULT_MODEL') ?? 'claude-haiku-4-5-20251001'
    if (!this.client || isDryRun) {
      const reason = !this.client ? 'no_api_key' : 'dry_run'
      return this.mockResponse(input, model, reason, isDryRun)
    }

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: input.maxTokens ?? 1200,
        temperature: input.temperature ?? 0.4,
        system: input.system,
        messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
      })

      const text = response.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('\n')

      const tokensIn = response.usage.input_tokens
      const tokensOut = response.usage.output_tokens
      const price = PRICING[model] ?? { in: 3, out: 15 }
      const costUsd = (tokensIn / 1_000_000) * price.in + (tokensOut / 1_000_000) * price.out

      return { text, model, tokensIn, tokensOut, costUsd, isDryRun: false }
    } catch (err) {
      this.logger.error(`LLM call failed, falling back to mock`, err as Error)
      return this.mockResponse(input, model, 'api_error', false)
    }
  }

  /**
   * Deterministic response used when no API key OR dry-run. Ensures the whole
   * agent flow works end-to-end in dev without any external dependency.
   */
  private mockResponse(input: LlmCallInput, model: string, reason: string, isDryRun: boolean): LlmCallOutput {
    const userMsg = input.messages[input.messages.length - 1]?.content ?? ''
    let text = ''

    // Route by agent so mock output resembles the real agent shape.
    if (input.agentKey === 'lead_hunter') {
      text = JSON.stringify({
        prospects: [
          { title: 'Metropolitan Electricity Authority — Smart Meter Rollout', source: 'e-GP Tender', budgetTHB: 12_500_000, icp: 91, notes: 'Matches: SCADA, IoT sensors. Closes 24 Jul.' },
          { title: 'Airports of Thailand — CCTV Analytics RFP', source: 'e-GP Tender', budgetTHB: 18_200_000, icp: 87, notes: 'Video analytics, AI. Suvarnabhumi. Closes 5 Aug.' },
          { title: 'CP Retailink — cold storage expansion (EEC)', source: 'Business news', budgetTHB: 7_500_000, icp: 76, notes: 'Cold-chain tracking match.' },
          { title: 'Betagro — new plant Lopburi', source: 'Company PR', budgetTHB: 4_000_000, icp: 71, notes: 'MES/automation opportunity.' },
        ],
      })
    } else if (input.agentKey === 'sales_assistant') {
      const context = safeParseInput(userMsg)
      const customerName = context.customerName ?? 'the customer'
      text = JSON.stringify({
        summary: `${customerName} is an active enterprise client with sustained engagement (multiple activities in the last 30 days). Open pipeline supports Q3 revenue guidance.`,
        nextBestAction: `Schedule a 30-minute executive touchpoint with the ${customerName} decision team this week to confirm budget owner and validate rollout timing.`,
        emailDraft: `Subject: Alignment on next steps\n\nHi team,\n\nFollowing up on our recent conversation — sharing an updated proposal reflecting our latest scoping. Are you available for a 30-minute call this week to align on timeline and next steps?\n\nBest,`,
      })
    } else if (input.agentKey === 'meeting_assistant') {
      text = JSON.stringify({
        summary: 'Discussion covered project scope, integration timeline, and budget confirmation. Customer confirmed board-level approval and requested a phased cutover plan to avoid downtime during Songkran.',
        actionItems: [
          { title: 'Send phased cutover plan (max 4h downtime)', owner: 'Nattaya P.', due: 'this Thursday' },
          { title: 'Update deal probability to 70%', owner: 'Nattaya P.', due: 'today' },
          { title: 'Invite plant engineer Porntip to Friday decision meeting', owner: 'Nattaya P.', due: 'tomorrow' },
        ],
        crmUpdates: { updateStage: 'Negotiation', updateProbability: 70 },
      })
    } else if (input.agentKey === 'document_assistant') {
      text = JSON.stringify({
        classification: 'tor',
        fields: {
          budget: 8_500_000, timeline: 'Delivery by 2026-08-30',
          requirements: ['Hospital ERP integration', 'HL7/FHIR interface', '250 named users'],
          contactName: 'Pimchanok Aree', contactEmail: 'pimchanok.a@thonburimed.com',
          project: 'Hospital ERP Integration', competitor: 'AlphaSoft ERP',
        },
      })
    } else if (input.agentKey === 'forecast_assistant') {
      text = JSON.stringify({
        summary: 'Q3 quota attainment at 38% based on committed + closed. Late-stage negotiations (2 deals ฿9.8M) are the largest swing factor. Risk: cold-chain deal idle 9 days.',
        winRatePrediction: [
          { dealTitle: 'Factory Automation Phase 2', predictedProb: 78, currentProb: 70, rationale: 'Confirmed budget + decision meeting scheduled.' },
          { dealTitle: 'Hospital ERP Integration', predictedProb: 48, currentProb: 55, rationale: 'Long silence since QT sent — probability drifted down.' },
          { dealTitle: 'Cold-chain Fleet Tracking', predictedProb: 30, currentProb: 40, rationale: 'Idle for 9 days — needs re-engagement.' },
        ],
        revenuePrediction: { committed: 15_100_000, weighted: 19_400_000, bestCase: 25_500_000 },
        riskAlerts: [
          'Idle deal >7d: Cold-chain Fleet Tracking (auto follow-up scheduled)',
          'Quotation viewed 3× without response: Thonburi Medical Hospital ERP',
        ],
      })
    } else {
      text = JSON.stringify({ message: `Mock LLM response for agent ${input.agentKey}.` })
    }

    const tokensIn = Math.max(200, Math.round((input.system.length + userMsg.length) / 4))
    const tokensOut = Math.max(150, Math.round(text.length / 4))
    const price = PRICING[model] ?? { in: 1, out: 5 }
    const costUsd = (tokensIn / 1_000_000) * price.in + (tokensOut / 1_000_000) * price.out

    return {
      text, model, tokensIn, tokensOut, costUsd, isDryRun,
      fallbackReason: reason,
    }
  }
}

function safeParseInput(msg: string): Record<string, string> {
  try {
    return JSON.parse(msg) as Record<string, string>
  } catch {
    return {}
  }
}
