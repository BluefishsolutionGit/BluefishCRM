import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { AiAgentKey, AiCostSummaryDto, AiResultDto, AiRunDto } from '@bluefish/shared'

interface CreateResultInput {
  kind: string
  title: string
  payload: Record<string, unknown>
}

@Injectable()
export class AiRunsService {
  constructor(private prisma: PrismaService) {}

  async start(agentKey: AiAgentKey, userId: string | null, input: unknown, promptVersion: number | null): Promise<string> {
    const run = await this.prisma.aiRun.create({
      data: {
        agentKey, userId, input: (input as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        status: 'running', promptVersion,
      },
    })
    return run.id
  }

  async complete(runId: string, opts: {
    status: 'complete' | 'error'
    model?: string; tokensIn?: number; tokensOut?: number; costUsd?: number
    isDryRun?: boolean; summary?: string; error?: string
    results?: CreateResultInput[]
  }): Promise<AiRunDto> {
    await this.prisma.aiRun.update({
      where: { id: runId },
      data: {
        status: opts.status, completedAt: new Date(),
        model: opts.model, tokensIn: opts.tokensIn ?? 0, tokensOut: opts.tokensOut ?? 0,
        costUsd: opts.costUsd ?? 0, isDryRun: opts.isDryRun ?? false,
        summary: opts.summary ?? null, error: opts.error ?? null,
      },
    })
    if (opts.results && opts.results.length > 0) {
      for (const r of opts.results) {
        await this.prisma.aiResult.create({
          data: { runId, kind: r.kind, title: r.title, payload: r.payload as Prisma.InputJsonValue },
        })
      }
    }
    return this.findOne(runId)
  }

  async list(filter: { agentKey?: string; userId?: string; limit?: number } = {}): Promise<AiRunDto[]> {
    const rows = await this.prisma.aiRun.findMany({
      where: { agentKey: filter.agentKey, userId: filter.userId },
      include: { results: true, user: true },
      orderBy: { startedAt: 'desc' },
      take: filter.limit ?? 50,
    })
    return rows.map((r) => this.toRunDto(r))
  }

  async findOne(runId: string): Promise<AiRunDto> {
    const row = await this.prisma.aiRun.findUnique({
      where: { id: runId },
      include: { results: true, user: true },
    })
    if (!row) throw new NotFoundException('Run not found')
    return this.toRunDto(row)
  }

  async listPendingResults(agentKey?: string): Promise<AiResultDto[]> {
    const rows = await this.prisma.aiResult.findMany({
      where: { reviewStatus: 'pending', run: agentKey ? { agentKey } : undefined },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return rows.map((r) => this.toResultDto(r))
  }

  async findResult(id: string) {
    const row = await this.prisma.aiResult.findUnique({ where: { id }, include: { run: true } })
    if (!row) throw new NotFoundException('Result not found')
    return row
  }

  async setReviewed(resultId: string, decision: 'accepted' | 'rejected', userId: string, createdCrm?: { id: string; type: string }): Promise<AiResultDto> {
    const row = await this.prisma.aiResult.update({
      where: { id: resultId },
      data: {
        reviewStatus: decision,
        reviewedAt: new Date(),
        reviewedById: userId,
        createdCrmId: createdCrm?.id ?? null,
        createdCrmType: createdCrm?.type ?? null,
      },
    })
    return this.toResultDto(row)
  }

  async costSummary(): Promise<AiCostSummaryDto> {
    const [totalAgg, byAgentAgg, allRuns] = await Promise.all([
      this.prisma.aiRun.aggregate({
        _count: { id: true }, _sum: { tokensIn: true, tokensOut: true, costUsd: true },
      }),
      this.prisma.aiRun.groupBy({
        by: ['agentKey'], _count: { id: true }, _sum: { tokensIn: true, tokensOut: true, costUsd: true },
      }),
      this.prisma.aiRun.findMany({ select: { startedAt: true, costUsd: true } }),
    ])
    const dayMap = new Map<string, { runs: number; costUsd: number }>()
    for (const r of allRuns) {
      const day = r.startedAt.toISOString().slice(0, 10)
      const cur = dayMap.get(day) ?? { runs: 0, costUsd: 0 }
      cur.runs++; cur.costUsd += r.costUsd
      dayMap.set(day, cur)
    }
    const byDay = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, runs: v.runs, costUsd: Number(v.costUsd.toFixed(4)) }))

    return {
      totalRuns: totalAgg._count.id,
      totalTokensIn: totalAgg._sum.tokensIn ?? 0,
      totalTokensOut: totalAgg._sum.tokensOut ?? 0,
      totalCostUsd: Number((totalAgg._sum.costUsd ?? 0).toFixed(4)),
      byAgent: byAgentAgg.map((a) => ({
        agentKey: a.agentKey as AiAgentKey,
        runs: a._count.id,
        tokensIn: a._sum.tokensIn ?? 0,
        tokensOut: a._sum.tokensOut ?? 0,
        costUsd: Number((a._sum.costUsd ?? 0).toFixed(4)),
      })),
      byDay,
    }
  }

  private toRunDto(row: {
    id: string; agentKey: string; userId: string | null; status: string
    startedAt: Date; completedAt: Date | null; model: string | null
    tokensIn: number; tokensOut: number; costUsd: number; isDryRun: boolean
    error: string | null; summary: string | null; promptVersion: number | null
    user: { name: string } | null
    results: Array<{ id: string; kind: string; title: string; payload: unknown; reviewStatus: string; reviewedAt: Date | null; createdCrmId: string | null; createdCrmType: string | null; createdAt: Date }>
  }): AiRunDto {
    return {
      id: row.id, agentKey: row.agentKey as AiAgentKey,
      userId: row.userId, userName: row.user?.name ?? null,
      status: row.status as AiRunDto['status'],
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      model: row.model, tokensIn: row.tokensIn, tokensOut: row.tokensOut,
      costUsd: Number(row.costUsd.toFixed(6)),
      isDryRun: row.isDryRun, error: row.error, summary: row.summary,
      promptVersion: row.promptVersion,
      results: row.results.map((r) => this.toResultDto(r)),
    }
  }

  private toResultDto(row: {
    id: string; kind: string; title: string; payload: unknown
    reviewStatus: string; reviewedAt: Date | null
    createdCrmId: string | null; createdCrmType: string | null
    createdAt: Date
  }): AiResultDto {
    return {
      id: row.id, kind: row.kind, title: row.title,
      payload: (row.payload as Record<string, unknown>) ?? {},
      reviewStatus: row.reviewStatus as 'pending' | 'accepted' | 'rejected',
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdCrmId: row.createdCrmId, createdCrmType: row.createdCrmType,
      createdAt: row.createdAt.toISOString(),
    }
  }
}
