import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { IndustryTypesService } from './industry-types.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { IndustryTypeDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class CreateIndustryTypeBody {
  @IsString() @MinLength(1) name!: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsBoolean() active?: boolean
}
class UpdateIndustryTypeBody {
  @IsOptional() @IsString() @MinLength(1) name?: string
  @IsOptional() @IsString() description?: string | null
  @IsOptional() @IsBoolean() active?: boolean
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('industry-types')
export class IndustryTypesController {
  constructor(private industries: IndustryTypesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  list(@Query('includeInactive') includeInactive?: string): Promise<IndustryTypeDto[]> {
    return this.industries.list(includeInactive === 'true' || includeInactive === '1')
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  create(@Body() body: CreateIndustryTypeBody, @Req() req: JwtRequest): Promise<IndustryTypeDto> {
    return this.industries.create(body, auditContext(req))
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  update(@Param('id') id: string, @Body() body: UpdateIndustryTypeBody, @Req() req: JwtRequest): Promise<IndustryTypeDto> {
    return this.industries.update(id, body, auditContext(req))
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async delete(@Param('id') id: string, @Req() req: JwtRequest): Promise<void> {
    await this.industries.delete(id, auditContext(req))
  }
}
