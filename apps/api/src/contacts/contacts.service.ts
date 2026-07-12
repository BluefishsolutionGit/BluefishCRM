import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { ContactDto, CreateContactDto, UpdateContactDto } from '@bluefish/shared'

export interface AuditCtx {
  userId?: string
  ip?: string | null
  userAgent?: string | null
}

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async listByCustomer(customerId: string): Promise<ContactDto[]> {
    const rows = await this.prisma.contact.findMany({
      where: { customerId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    })
    return rows.map(this.toDto)
  }

  async create(customerId: string, input: CreateContactDto, ctx: AuditCtx): Promise<ContactDto> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } })
    if (!customer) throw new NotFoundException('Customer not found')

    if (input.isPrimary) {
      await this.prisma.contact.updateMany({ where: { customerId, isPrimary: true }, data: { isPrimary: false } })
    }

    const row = await this.prisma.contact.create({
      data: { customerId, name: input.name, role: input.role, phone: input.phone, email: input.email, isPrimary: input.isPrimary ?? false },
    })

    await this.audit.log({
      userId: ctx.userId, action: 'contact.create', entity: 'contact', entityId: row.id,
      after: row, ip: ctx.ip, userAgent: ctx.userAgent, metadata: { customerId },
    })
    return this.toDto(row)
  }

  async update(id: string, input: UpdateContactDto, ctx: AuditCtx): Promise<ContactDto> {
    const before = await this.prisma.contact.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('Contact not found')

    if (input.isPrimary === true) {
      await this.prisma.contact.updateMany({ where: { customerId: before.customerId, isPrimary: true, NOT: { id } }, data: { isPrimary: false } })
    }

    const row = await this.prisma.contact.update({ where: { id }, data: input })

    await this.audit.log({
      userId: ctx.userId, action: 'contact.update', entity: 'contact', entityId: id,
      before, after: row, ip: ctx.ip, userAgent: ctx.userAgent,
    })
    return this.toDto(row)
  }

  async delete(id: string, ctx: AuditCtx): Promise<void> {
    const before = await this.prisma.contact.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('Contact not found')
    await this.prisma.contact.delete({ where: { id } })
    await this.audit.log({
      userId: ctx.userId, action: 'contact.delete', entity: 'contact', entityId: id,
      before, ip: ctx.ip, userAgent: ctx.userAgent,
    })
  }

  private toDto(row: {
    id: string; customerId: string; name: string; role: string; phone: string; email: string; isPrimary: boolean
  }): ContactDto {
    return { id: row.id, customerId: row.customerId, name: row.name, role: row.role, phone: row.phone, email: row.email, isPrimary: row.isPrimary }
  }
}
