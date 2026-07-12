import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface AuditInput {
  userId?: string | null
  action: string
  entity?: string | null
  entityId?: string | null
  before?: unknown
  after?: unknown
  ip?: string | null
  userAgent?: string | null
  metadata?: unknown
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(private prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          entity: input.entity ?? null,
          entityId: input.entityId ?? null,
          before: input.before ? (input.before as Prisma.InputJsonValue) : undefined,
          after: input.after ? (input.after as Prisma.InputJsonValue) : undefined,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
        },
      })
    } catch (err) {
      this.logger.error(`Failed to write audit log for action=${input.action}`, err as Error)
    }
  }

  list(filter: { entity?: string; entityId?: string; userId?: string; limit?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        entity: filter.entity,
        entityId: filter.entityId,
        userId: filter.userId,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 500),
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    })
  }
}
