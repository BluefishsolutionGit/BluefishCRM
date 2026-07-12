import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LlmClient, type LlmCallInput } from './llm-client'
import { AiRunsService } from './ai-runs.service'
import { AGENT_DEFS, findAgent, renderTemplate } from './prompts'
import { OpportunitiesService } from '../opportunities/opportunities.service'
import type { AiAgentDto, AiAgentKey, AiRunDto } from '@bluefish/shared'

interface RunOptions {
  input?: Record<string, unknown>
  isDryRun?: boolean
}

@Injectable()
export class AgentOrchestrator {
  constructor(
    private prisma: PrismaService,
    private llm: LlmClient,
    private runs: AiRunsService,
    private opportunities: OpportunitiesService,
  ) {}

  async listAgents(): Promise<AiAgentDto[]> {
    return Promise.all(AGENT_DEFS.map(async (a) => {
      const promptVersion = await this.prisma.aiPromptVersion.findFirst({
        where: { agentKey: a.key, isActive: true },
        orderBy: { version: 'desc' },
      })
      return {
        key: a.key, name: a.name, description: a.description,
        category: a.category, needsInput: a.needsInput, enabled: true,
        latestPromptVersion: promptVersion?.version ?? 1,
      }
    }))
  }

  async run(agentKey: AiAgentKey, userId: string, opts: RunOptions = {}): Promise<AiRunDto> {
    const def = findAgent(agentKey)
    const promptVersion = await this.prisma.aiPromptVersion.findFirst({
      where: { agentKey, isActive: true }, orderBy: { version: 'desc' },
    })
    const vars = await this.buildVariables(agentKey, opts.input ?? {})
    const userMessage = renderTemplate(promptVersion?.userTemplate ?? def.userTemplate, vars)
    const systemPrompt = promptVersion?.systemPrompt ?? def.systemPrompt
    const model = promptVersion?.model ?? def.model
    const temperature = promptVersion?.temperature ?? def.temperature

    const runId = await this.runs.start(agentKey, userId, opts.input, promptVersion?.version ?? 1)

    try {
      const callInput: LlmCallInput = {
        agentKey, system: systemPrompt, messages: [{ role: 'user', content: userMessage }],
        model, temperature,
      }
      const out = await this.llm.call(callInput, opts.isDryRun ?? false)

      // Parse the JSON response — the prompts require strict JSON output.
      let parsed: unknown
      try {
        parsed = JSON.parse(this.stripCodeFences(out.text))
      } catch {
        throw new BadRequestException('Agent output was not valid JSON — check the prompt')
      }

      const results = this.buildResults(agentKey, parsed)
      const summary = this.buildSummary(agentKey, parsed)

      await this.runs.complete(runId, {
        status: 'complete', model: out.model,
        tokensIn: out.tokensIn, tokensOut: out.tokensOut, costUsd: out.costUsd,
        isDryRun: out.isDryRun, summary, results,
      })
    } catch (err) {
      await this.runs.complete(runId, {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return this.runs.findOne(runId)
  }

  private stripCodeFences(text: string): string {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }

  private async buildVariables(agentKey: AiAgentKey, input: Record<string, unknown>): Promise<Record<string, string>> {
    switch (agentKey) {
      case 'lead_hunter': {
        // Provide a synthetic list of sources — in prod these would come from crawlers.
        const sources = [
          '(e-GP tender) MEA Smart Substation Monitoring · closing 24 Jul · budget ~฿12.5M · matches SCADA/IoT',
          '(e-GP tender) Airports of Thailand CCTV Analytics RFP · closing 5 Aug · budget ~฿18M · video analytics',
          '(Business news) CP Retailink cold storage expansion in EEC · 3 new DCs · cold-chain match',
          '(Company PR) Betagro new plant Lopburi · construction Q4 · MES/automation opportunity',
          '(e-GP tender) Hatyai Municipality e-Gov portal · closing 10 Oct · budget ~฿6.8M · Legacy IT holds it',
        ]
        return { sources: sources.join('\n') }
      }
      case 'sales_assistant': {
        const customerId = String(input.customerId ?? '')
        if (!customerId) throw new BadRequestException('customerId required')
        const customer = await this.prisma.customer.findUnique({
          where: { id: customerId },
          include: {
            opportunities: { where: { stage: { in: ['Qualification', 'Proposal', 'Negotiation'] } } },
            activities: { orderBy: { scheduledAt: 'desc' }, take: 5 },
          },
        })
        if (!customer) throw new BadRequestException('Customer not found')
        return {
          context: JSON.stringify({
            customerName: customer.name, industry: customer.industry,
            openValue: customer.openValue, wonValue: customer.wonValue,
            openOpportunities: customer.opportunities.map((o) => ({ title: o.title, stage: o.stage, value: o.value, prob: o.probability })),
            recentActivities: customer.activities.map((a) => ({ type: a.type, title: a.title, scheduledAt: a.scheduledAt })),
          }),
        }
      }
      case 'meeting_assistant': {
        const transcript = String(input.transcript ?? '')
        if (!transcript) throw new BadRequestException('transcript required')
        return {
          transcript: transcript.slice(0, 8000),
          context: input.customerId ? `Customer id: ${String(input.customerId)}` : '(no linked customer)',
        }
      }
      case 'document_assistant': {
        const text = String(input.text ?? '')
        if (!text) throw new BadRequestException('text required')
        return { text: text.slice(0, 4000) }
      }
      case 'forecast_assistant': {
        const opps = await this.opportunities.list()
        return {
          pipeline: JSON.stringify(opps.slice(0, 30).map((o) => ({
            title: o.title, customer: o.customerName, stage: o.stage,
            value: o.value, prob: o.probability, closeDate: o.closeDate,
          }))),
        }
      }
    }
  }

  private buildResults(agentKey: AiAgentKey, parsed: unknown): Array<{ kind: string; title: string; payload: Record<string, unknown> }> {
    if (agentKey === 'lead_hunter') {
      const list = ((parsed as { prospects?: unknown[] }).prospects ?? []) as Array<{ title: string; source: string; budgetTHB: number; icp: number; notes: string }>
      return list.map((p) => ({
        kind: 'lead', title: p.title,
        payload: p as unknown as Record<string, unknown>,
      }))
    }
    if (agentKey === 'sales_assistant') {
      const p = parsed as { summary?: string; nextBestAction?: string; emailDraft?: string }
      return [{
        kind: 'customer_brief',
        title: p.nextBestAction ? `Next: ${p.nextBestAction.slice(0, 60)}` : 'Customer brief',
        payload: p as unknown as Record<string, unknown>,
      }]
    }
    if (agentKey === 'meeting_assistant') {
      const p = parsed as { summary?: string; actionItems?: Array<{ title: string; owner: string; due: string }>; crmUpdates?: Record<string, unknown> }
      const items: Array<{ kind: string; title: string; payload: Record<string, unknown> }> = [
        { kind: 'meeting_mom', title: 'Meeting MOM', payload: { summary: p.summary ?? '', crmUpdates: p.crmUpdates ?? {} } },
      ]
      for (const a of p.actionItems ?? []) {
        items.push({ kind: 'action_item', title: a.title, payload: a as unknown as Record<string, unknown> })
      }
      return items
    }
    if (agentKey === 'document_assistant') {
      const p = parsed as { classification?: string; fields?: Record<string, unknown> }
      return [{
        kind: 'doc_extraction',
        title: `Extracted (${p.classification ?? 'document'})`,
        payload: p as unknown as Record<string, unknown>,
      }]
    }
    if (agentKey === 'forecast_assistant') {
      const p = parsed as { summary?: string; winRatePrediction?: unknown; revenuePrediction?: unknown; riskAlerts?: unknown }
      return [{
        kind: 'forecast', title: 'Forecast update',
        payload: p as unknown as Record<string, unknown>,
      }]
    }
    return []
  }

  private buildSummary(agentKey: AiAgentKey, parsed: unknown): string {
    if (agentKey === 'lead_hunter') {
      const list = ((parsed as { prospects?: unknown[] }).prospects ?? []) as Array<{ title: string; icp: number }>
      const top = list.filter((p) => p.icp >= 70).length
      return `${list.length} prospects proposed (${top} with ICP ≥ 70).`
    }
    if (agentKey === 'sales_assistant') {
      return (parsed as { nextBestAction?: string }).nextBestAction ?? 'Customer brief ready.'
    }
    if (agentKey === 'meeting_assistant') {
      const p = parsed as { actionItems?: unknown[] }
      return `${(p.actionItems ?? []).length} action items extracted.`
    }
    if (agentKey === 'document_assistant') {
      const p = parsed as { classification?: string; fields?: Record<string, unknown> }
      const fieldCount = Object.keys(p.fields ?? {}).length
      return `Classified as "${p.classification ?? 'other'}", ${fieldCount} fields extracted.`
    }
    if (agentKey === 'forecast_assistant') {
      return (parsed as { summary?: string }).summary ?? 'Forecast produced.'
    }
    return ''
  }
}
