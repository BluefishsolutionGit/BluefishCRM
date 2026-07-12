import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { InboxChannel, InboxMessageDto, InboxThreadDto } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

interface IncomingMessageInput {
  channel: InboxChannel
  externalThreadId: string
  externalMessageId?: string
  authorName: string
  companyName?: string
  text: string
  sentAt?: Date
}

@Injectable()
export class InboxService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async listThreads(): Promise<InboxThreadDto[]> {
    const rows = await this.prisma.inboxThread.findMany({
      include: {
        customer: true, owner: true,
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    })
    return rows.map((r) => this.toThreadDto(r))
  }

  async getThread(id: string): Promise<InboxThreadDto> {
    const row = await this.prisma.inboxThread.findUnique({
      where: { id }, include: {
        customer: true, owner: true,
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
    })
    if (!row) throw new NotFoundException('Thread not found')
    return this.toThreadDto(row)
  }

  async listMessages(threadId: string): Promise<InboxMessageDto[]> {
    const rows = await this.prisma.inboxMessage.findMany({
      where: { threadId }, orderBy: { sentAt: 'asc' },
    })
    return rows.map((m) => this.toMessageDto(m))
  }

  async ingestIncoming(input: IncomingMessageInput): Promise<{ threadId: string; messageId: string }> {
    // Find or create thread by (channel, externalId)
    const thread = await this.prisma.inboxThread.upsert({
      where: { channel_externalId: { channel: input.channel, externalId: input.externalThreadId } },
      update: {
        name: input.authorName, companyName: input.companyName,
        lastMessageAt: input.sentAt ?? new Date(),
        unread: { increment: 1 },
      },
      create: {
        channel: input.channel, externalId: input.externalThreadId,
        name: input.authorName, companyName: input.companyName,
        lastMessageAt: input.sentAt ?? new Date(),
        unread: 1,
      },
    })

    const message = await this.prisma.inboxMessage.create({
      data: {
        threadId: thread.id, direction: 'in',
        text: input.text, authorName: input.authorName,
        externalMessageId: input.externalMessageId,
        sentAt: input.sentAt ?? new Date(),
      },
    })

    await this.audit.log({
      action: 'inbox.message.in', entity: 'thread', entityId: thread.id,
      metadata: { channel: input.channel, externalMessageId: input.externalMessageId },
    })
    return { threadId: thread.id, messageId: message.id }
  }

  async sendReply(threadId: string, text: string, userId: string, ctx: AuditRequestContext): Promise<InboxMessageDto> {
    if (!text.trim()) throw new BadRequestException('Message text required')
    const thread = await this.prisma.inboxThread.findUnique({ where: { id: threadId } })
    if (!thread) throw new NotFoundException('Thread not found')

    const user = await this.prisma.user.findUnique({ where: { id: userId } })

    // In real life this would call LINE/FB/IG send-message APIs. In dev we just persist the outbound message.
    const message = await this.prisma.inboxMessage.create({
      data: {
        threadId, direction: 'out', text,
        authorName: user?.name ?? null,
        sentAt: new Date(),
      },
    })
    await this.prisma.inboxThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date(), unread: 0 },
    })
    await this.audit.log({ ...ctx, action: 'inbox.message.out', entity: 'thread', entityId: threadId })
    return this.toMessageDto(message)
  }

  async markRead(threadId: string): Promise<InboxThreadDto> {
    await this.prisma.inboxThread.update({ where: { id: threadId }, data: { unread: 0 } })
    return this.getThread(threadId)
  }

  async assign(threadId: string, ownerId: string | null, ctx: AuditRequestContext): Promise<InboxThreadDto> {
    await this.prisma.inboxThread.update({ where: { id: threadId }, data: { ownerId } })
    await this.audit.log({ ...ctx, action: 'inbox.assign', entity: 'thread', entityId: threadId, metadata: { ownerId } })
    return this.getThread(threadId)
  }

  async link(threadId: string, customerId: string, ctx: AuditRequestContext): Promise<InboxThreadDto> {
    await this.prisma.inboxThread.update({ where: { id: threadId }, data: { customerId } })
    await this.audit.log({ ...ctx, action: 'inbox.link', entity: 'thread', entityId: threadId, metadata: { customerId } })
    return this.getThread(threadId)
  }

  private toThreadDto(row: {
    id: string; channel: string; externalId: string; name: string
    companyName: string | null; customerId: string | null; ownerId: string | null
    tag: string | null; unread: number; lastMessageAt: Date; createdAt: Date
    customer: { name: string } | null; owner: { name: string } | null
    messages: Array<{ id: string; threadId: string; direction: string; text: string; authorName: string | null; sentAt: Date }>
  }): InboxThreadDto {
    return {
      id: row.id, channel: row.channel as InboxChannel, externalId: row.externalId,
      name: row.name, companyName: row.companyName,
      customerId: row.customerId, customerName: row.customer?.name ?? null,
      ownerId: row.ownerId, ownerName: row.owner?.name ?? null,
      tag: row.tag, unread: row.unread,
      lastMessageAt: row.lastMessageAt.toISOString(),
      latestMessage: row.messages[0] ? this.toMessageDto(row.messages[0]) : null,
      createdAt: row.createdAt.toISOString(),
    }
  }

  private toMessageDto(row: { id: string; threadId: string; direction: string; text: string; authorName: string | null; sentAt: Date }): InboxMessageDto {
    return {
      id: row.id, threadId: row.threadId,
      direction: row.direction as 'in' | 'out',
      text: row.text, authorName: row.authorName,
      sentAt: row.sentAt.toISOString(),
    }
  }
}
