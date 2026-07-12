import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const ASSIGNABLE_ROLES = ['sales_manager', 'sales_rep']

@Injectable()
export class AssignmentService {
  constructor(private prisma: PrismaService) {}

  async nextOwnerForLead(): Promise<string | null> {
    const users = await this.prisma.user.findMany({
      where: { role: { name: { in: ASSIGNABLE_ROLES } } },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    })
    if (users.length === 0) return null

    const rule = await this.prisma.assignmentRule.upsert({
      where: { entityType: 'lead' },
      update: {},
      create: { entityType: 'lead', method: 'round_robin' },
    })

    const lastIdx = rule.lastAssignedUserId
      ? users.findIndex((u) => u.id === rule.lastAssignedUserId)
      : -1
    const nextIdx = (lastIdx + 1) % users.length
    const chosen = users[nextIdx]
    await this.prisma.assignmentRule.update({
      where: { entityType: 'lead' },
      data: { lastAssignedUserId: chosen.id },
    })
    return chosen.id
  }
}
