import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { ContactDto, ContactSearchResultDto, CreateContactDto, UpdateContactDto } from '@bluefish/shared'

export interface AuditCtx {
  userId?: string
  ip?: string | null
  userAgent?: string | null
}

type ContactRow = {
  id: string; customerId: string
  name: string; firstName: string | null; lastName: string | null; nickname: string | null
  role: string; position: string | null; department: string | null
  email: string; phone: string; telephone: string | null
  lineId: string | null; notes: string | null; isPrimary: boolean
}

function deriveName(input: { name?: string; firstName?: string | null; lastName?: string | null; nickname?: string | null }): string {
  if (input.name && input.name.trim()) return input.name.trim()
  const parts = [input.firstName, input.lastName].filter((p): p is string => Boolean(p?.trim()))
  const full = parts.join(' ').trim()
  if (full) return full
  if (input.nickname?.trim()) return input.nickname.trim()
  return ''
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

  /**
   * Case-insensitive substring match against name or email — capped at 20 for the
   * autocomplete so the browser isn't drowned in results on a bare "a". Empty query
   * short-circuits to [] to avoid a full-table scan on modal open.
   */
  async search(q: string): Promise<ContactSearchResultDto[]> {
    const trimmed = q.trim()
    if (trimmed.length === 0) return []
    const rows = await this.prisma.contact.findMany({
      where: {
        OR: [
          { name:  { contains: trimmed, mode: 'insensitive' } },
          { email: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true, customerId: true, customer: { select: { name: true } } },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      take: 20,
    })
    return rows.map((r) => ({
      id: r.id, name: r.name, email: r.email,
      customerId: r.customerId, customerName: r.customer.name,
    }))
  }

  async create(customerId: string, input: CreateContactDto, ctx: AuditCtx): Promise<ContactDto> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } })
    if (!customer) throw new NotFoundException('Customer not found')

    if (input.isPrimary) {
      await this.prisma.contact.updateMany({ where: { customerId, isPrimary: true }, data: { isPrimary: false } })
    }

    const displayName = deriveName(input)
    if (!displayName) throw new NotFoundException('Contact must have at least a first/last name or nickname')

    const row = await this.prisma.contact.create({
      data: {
        customerId,
        name: displayName,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        nickname: input.nickname ?? null,
        role: input.role ?? input.position ?? '',
        position: input.position ?? null,
        department: input.department ?? null,
        email: input.email,
        phone: input.phone,
        telephone: input.telephone ?? null,
        lineId: input.lineId ?? null,
        notes: input.notes ?? null,
        isPrimary: input.isPrimary ?? false,
      },
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

    // If any name component changed, recompute the display name
    const nextName = input.name !== undefined
      ? input.name
      : (input.firstName !== undefined || input.lastName !== undefined || input.nickname !== undefined)
        ? deriveName({
            firstName: input.firstName !== undefined ? input.firstName : before.firstName,
            lastName: input.lastName !== undefined ? input.lastName : before.lastName,
            nickname: input.nickname !== undefined ? input.nickname : before.nickname,
          }) || before.name
        : undefined

    const row = await this.prisma.contact.update({
      where: { id },
      data: {
        ...(nextName !== undefined ? { name: nextName } : {}),
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.department !== undefined ? { department: input.department } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.telephone !== undefined ? { telephone: input.telephone } : {}),
        ...(input.lineId !== undefined ? { lineId: input.lineId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      },
    })

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

  private toDto(row: ContactRow): ContactDto {
    return {
      id: row.id, customerId: row.customerId,
      name: row.name,
      firstName: row.firstName, lastName: row.lastName, nickname: row.nickname,
      role: row.role, position: row.position, department: row.department,
      email: row.email, phone: row.phone, telephone: row.telephone,
      lineId: row.lineId, notes: row.notes,
      isPrimary: row.isPrimary,
    }
  }
}
