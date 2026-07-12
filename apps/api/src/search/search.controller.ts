import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PrismaService } from '../prisma/prisma.service'
import type { GlobalSearchResultDto } from '@bluefish/shared'

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async search(@Query('q') qRaw?: string, @Query('limit') limit?: string): Promise<GlobalSearchResultDto> {
    const q = (qRaw ?? '').trim()
    const take = Math.min(limit ? Number(limit) : 6, 20)
    if (q.length < 2) return { query: q, customers: [], leads: [], opportunities: [], quotations: [], contracts: [] }

    const insensitive = { contains: q, mode: 'insensitive' as const }

    const [customers, leads, opportunities, quotations, contracts] = await Promise.all([
      this.prisma.customer.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: insensitive },
            { nameTh: insensitive },
            { code: insensitive },
            { taxId: insensitive },
          ],
        },
        take,
        select: { id: true, code: true, name: true, industry: true },
      }),
      this.prisma.lead.findMany({
        where: { OR: [{ name: insensitive }, { companyName: insensitive }, { email: insensitive }] },
        take,
        select: { id: true, name: true, companyName: true, status: true, score: true },
      }),
      this.prisma.opportunity.findMany({
        where: { OR: [{ title: insensitive }, { customer: { name: insensitive } }] },
        take,
        select: { id: true, title: true, stage: true, value: true, customer: { select: { name: true } } },
      }),
      this.prisma.quotation.findMany({
        where: { OR: [{ no: insensitive }, { customer: { name: insensitive } }] },
        take,
        select: { id: true, no: true, status: true, customer: { select: { name: true } } },
      }),
      this.prisma.contract.findMany({
        where: { OR: [{ no: insensitive }, { customer: { name: insensitive } }] },
        take,
        select: { id: true, no: true, status: true, customer: { select: { name: true } } },
      }),
    ])

    return {
      query: q,
      customers: customers.map((c) => ({ id: c.id, code: c.code, name: c.name, industry: c.industry })),
      leads: leads.map((l) => ({ id: l.id, name: l.name, companyName: l.companyName, status: l.status, score: l.score })),
      opportunities: opportunities.map((o) => ({ id: o.id, title: o.title, stage: o.stage, value: o.value, customerName: o.customer.name })),
      quotations: quotations.map((q2) => ({ id: q2.id, no: q2.no, status: q2.status, customerName: q2.customer.name })),
      contracts: contracts.map((c) => ({ id: c.id, no: c.no, status: c.status, customerName: c.customer.name })),
    }
  }
}
