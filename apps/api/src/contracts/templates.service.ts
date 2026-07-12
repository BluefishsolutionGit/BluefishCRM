import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { ContractTemplateDto } from '@bluefish/shared'

@Injectable()
export class ContractTemplatesService {
  constructor(private prisma: PrismaService) {}

  async list(includeInactive = false): Promise<ContractTemplateDto[]> {
    const rows = await this.prisma.contractTemplate.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { code: 'asc' },
    })
    return rows.map(this.toDto)
  }

  async findOne(id: string): Promise<ContractTemplateDto> {
    const row = await this.prisma.contractTemplate.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Template not found')
    return this.toDto(row)
  }

  /**
   * Render a template body with {{var}} placeholders replaced by values.
   * Missing values become "[[var]]" so they're visibly incomplete.
   */
  render(body: string, values: Record<string, string>): string {
    return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
      const v = values[key]
      return v && v.length > 0 ? v : `[[${key}]]`
    })
  }

  extractVariables(body: string): string[] {
    const set = new Set<string>()
    for (const m of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) set.add(m[1])
    return [...set]
  }

  private toDto = (row: { id: string; code: string; name: string; type: string; body: string; variables: unknown; isActive: boolean }): ContractTemplateDto => ({
    id: row.id, code: row.code, name: row.name, type: row.type, body: row.body,
    variables: Array.isArray(row.variables) ? (row.variables as string[]) : this.extractVariables(row.body),
    isActive: row.isActive,
  })
}
