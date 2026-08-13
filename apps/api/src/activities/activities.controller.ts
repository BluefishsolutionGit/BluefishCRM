import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { IsArray, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { ActivitiesService } from './activities.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { ActivityDto, ActivityStatus, ActivityType, AttendeeInput, RecurrencePatternDto } from '@bluefish/shared'

const TYPES: ActivityType[] = ['meeting', 'call', 'visit', 'demo', 'task', 'follow_up', 'email']
const STATUSES: ActivityStatus[] = ['scheduled', 'completed', 'cancelled']

class CreateBody {
  @IsIn(TYPES) type!: ActivityType
  @IsString() @MinLength(1) title!: string
  @IsOptional() @IsString() description?: string
  @IsISO8601() scheduledAt!: string
  @IsOptional() @IsInt() durationMin?: number
  @IsString() ownerId!: string
  @IsOptional() @IsString() customerId?: string
  @IsOptional() @IsString() opportunityId?: string
  @IsOptional() @IsIn(STATUSES) status?: ActivityStatus
  @IsOptional() @IsString() location?: string
  @IsOptional() @IsString() meetingLink?: string
  @IsOptional() @IsString() notes?: string
  @IsOptional() @IsArray() attendees?: AttendeeInput[]
  // Passed through to the service which validates + normalises the shape. null clears.
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsObject() recurrence?: RecurrencePatternDto | null
}
class UpdateBody {
  @IsOptional() @IsIn(TYPES) type?: ActivityType
  @IsOptional() @IsString() title?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsISO8601() scheduledAt?: string
  @IsOptional() @IsInt() durationMin?: number
  @IsOptional() @IsString() ownerId?: string
  @IsOptional() @IsString() customerId?: string
  @IsOptional() @IsString() opportunityId?: string
  @IsOptional() @IsIn(STATUSES) status?: ActivityStatus
  @IsOptional() @IsString() location?: string
  @IsOptional() @IsString() meetingLink?: string
  @IsOptional() @IsString() notes?: string
  @IsOptional() @IsArray() attendees?: AttendeeInput[]
  // Passed through to the service which validates + normalises the shape. null clears.
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsObject() recurrence?: RecurrencePatternDto | null
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private activities: ActivitiesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ownerId') ownerId?: string,
    @Query('customerId') customerId?: string,
    @Query('opportunityId') opportunityId?: string,
  ): Promise<ActivityDto[]> {
    return this.activities.list({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      ownerId, customerId, opportunityId,
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_READ)
  findOne(@Param('id') id: string): Promise<ActivityDto> {
    return this.activities.findOne(id)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_WRITE)
  create(@Body() body: CreateBody, @Req() req: Request): Promise<ActivityDto> {
    return this.activities.create(body, auditContext(req))
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_WRITE)
  update(@Param('id') id: string, @Body() body: UpdateBody, @Req() req: Request): Promise<ActivityDto> {
    return this.activities.update(id, body, auditContext(req))
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_WRITE)
  async delete(@Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.activities.delete(id, auditContext(req))
  }

  @Post(':id/resync')
  @RequirePermissions(PERMISSIONS.OPPORTUNITY_WRITE)
  resync(@Param('id') id: string, @Req() req: Request): Promise<ActivityDto> {
    return this.activities.forceResync(id, auditContext(req))
  }
}
