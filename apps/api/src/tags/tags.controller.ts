import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common'
import { ArrayUnique, IsHexColor, IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { TagsService } from './tags.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { TagDto } from '@bluefish/shared'

const KINDS = ['department', 'priority', 'industry', 'custom'] as const

class CreateTagBody {
  @IsString() @MinLength(1) @MaxLength(60) name!: string
  @IsOptional() @IsHexColor() color?: string
  @IsOptional() @IsIn(KINDS) kind?: (typeof KINDS)[number]
  @IsOptional() @IsString() @MaxLength(200) description?: string
}
class UpdateTagBody {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string
  @IsOptional() @IsHexColor() color?: string
  @IsOptional() @IsIn(KINDS) kind?: (typeof KINDS)[number]
  @IsOptional() @IsString() @MaxLength(200) description?: string
}
class SetCustomerTagsBody {
  @IsString({ each: true })
  @ArrayUnique()
  @Length(0, 40, { each: true })
  tagIds!: string[]
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class TagsController {
  constructor(private tags: TagsService) {}

  @Get('tags')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  list(): Promise<TagDto[]> {
    return this.tags.list()
  }

  @Post('tags')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  create(@Body() body: CreateTagBody, @Req() req: Request): Promise<TagDto> {
    return this.tags.create(body, auditContext(req))
  }

  @Patch('tags/:id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  update(@Param('id') id: string, @Body() body: UpdateTagBody, @Req() req: Request): Promise<TagDto> {
    return this.tags.update(id, body, auditContext(req))
  }

  @Delete('tags/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  async delete(@Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.tags.delete(id, auditContext(req))
  }

  @Put('customers/:id/tags')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  setCustomerTags(@Param('id') id: string, @Body() body: SetCustomerTagsBody, @Req() req: Request): Promise<TagDto[]> {
    return this.tags.setCustomerTags(id, body.tagIds, auditContext(req))
  }
}
