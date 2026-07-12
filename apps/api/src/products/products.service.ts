import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { CreateProductDto, ProductDto, UpdateProductDto } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(includeInactive = false): Promise<ProductDto[]> {
    const rows = await this.prisma.product.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { code: 'asc' },
    })
    return rows.map(this.toDto)
  }

  async create(input: CreateProductDto, ctx: AuditRequestContext): Promise<ProductDto> {
    const existing = await this.prisma.product.findUnique({ where: { code: input.code } })
    if (existing) throw new ConflictException(`Product code ${input.code} already exists`)
    const row = await this.prisma.product.create({ data: { ...input, currency: input.currency ?? 'THB' } })
    await this.audit.log({ ...ctx, action: 'product.create', entity: 'product', entityId: row.id, after: row })
    return this.toDto(row)
  }

  async update(id: string, input: UpdateProductDto, ctx: AuditRequestContext): Promise<ProductDto> {
    const before = await this.prisma.product.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Product ${id} not found`)
    const row = await this.prisma.product.update({ where: { id }, data: input })
    await this.audit.log({ ...ctx, action: 'product.update', entity: 'product', entityId: id, before, after: row })
    return this.toDto(row)
  }

  async delete(id: string, ctx: AuditRequestContext): Promise<void> {
    const before = await this.prisma.product.findUnique({ where: { id } })
    if (!before) throw new NotFoundException(`Product ${id} not found`)
    await this.prisma.product.update({ where: { id }, data: { isActive: false } })
    await this.audit.log({ ...ctx, action: 'product.deactivate', entity: 'product', entityId: id, before })
  }

  private toDto(row: { id: string; code: string; name: string; description: string | null; unitPrice: number; currency: string; isActive: boolean }): ProductDto {
    return { id: row.id, code: row.code, name: row.name, description: row.description, unitPrice: row.unitPrice, currency: row.currency, isActive: row.isActive }
  }
}
