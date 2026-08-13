import { BadRequestException, Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common'
import { IsInt, IsString, Matches, Min } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { PrismaService } from '../prisma/prisma.service'
import { SERVICE_LINES } from '@bluefish/shared'
import type { SalesTargetDto } from '@bluefish/shared'

class SetTargetBody {
  @IsString() @Matches(/^\d{4}$/) period!: string
  @IsInt() @Min(0) amount!: number
}

@Controller('sales-targets')
@UseGuards(JwtAuthGuard)
export class SalesTargetsController {
  constructor(private prisma: PrismaService) {}

  /** Read is open to anyone signed in — the dashboard needs them to compute pctOfTarget. */
  @Get()
  async list(@Query('period') period?: string): Promise<SalesTargetDto[]> {
    const rows = await this.prisma.salesTarget.findMany({
      where: period ? { period } : undefined,
      orderBy: [{ period: 'desc' }, { service: 'asc' }],
    })
    return rows.map((r) => ({ service: r.service, period: r.period, amount: r.amount }))
  }

  /** Upsert one service/period target. Admin-only. */
  @Put(':service')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async set(@Param('service') service: string, @Body() body: SetTargetBody): Promise<SalesTargetDto> {
    if (!(SERVICE_LINES as readonly string[]).includes(service)) {
      throw new BadRequestException(`Unknown service line: ${service}`)
    }
    const row = await this.prisma.salesTarget.upsert({
      where: { service_period: { service, period: body.period } },
      create: { service, period: body.period, amount: body.amount },
      update: { amount: body.amount },
    })
    return { service: row.service, period: row.period, amount: row.amount }
  }
}
