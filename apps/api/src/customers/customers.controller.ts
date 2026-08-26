import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { CustomersService } from './customers.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import { SERVICE_LINES, type CustomerDto, type ServiceLine } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class CreateCustomerBody {
  @IsString() @MinLength(1) code!: string
  @IsString() @MinLength(1) name!: string
  @IsOptional() @IsString() nameTh?: string | null
  @IsString() industry!: string
  @IsOptional() @IsString() status?: 'Active' | 'Prospect' | 'Inactive'
  @IsString() ownerId!: string
  @IsString() city!: string
  @IsString() address!: string
  @IsString() taxId!: string
  @IsString() phone!: string
  @IsString() terms!: string
  @IsOptional() @IsInt() openValue?: number
  @IsOptional() @IsInt() wonValue?: number
  @IsOptional() @IsString() lastActivity?: string
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_LINES as readonly string[], { each: true }) primaryServiceLines?: ServiceLine[]
}
class UpdateCustomerBody {
  @IsOptional() @IsString() code?: string
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() nameTh?: string | null
  @IsOptional() @IsString() industry?: string
  @IsOptional() @IsString() status?: 'Active' | 'Prospect' | 'Inactive'
  @IsOptional() @IsString() ownerId?: string
  @IsOptional() @IsString() city?: string
  @IsOptional() @IsString() address?: string
  @IsOptional() @IsString() taxId?: string
  @IsOptional() @IsString() phone?: string
  @IsOptional() @IsString() terms?: string
  @IsOptional() @IsInt() openValue?: number
  @IsOptional() @IsInt() wonValue?: number
  @IsOptional() @IsString() lastActivity?: string
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_LINES as readonly string[], { each: true }) primaryServiceLines?: ServiceLine[]
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  list(@Req() req: JwtRequest, @Query('q') q?: string, @Query('tagId') tagId?: string): Promise<CustomerDto[]> {
    return this.customers.list(req, q, tagId)
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_READ)
  findOne(@Param('id') id: string, @Req() req: JwtRequest): Promise<CustomerDto> {
    return this.customers.findOne(id, req)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  create(@Body() body: CreateCustomerBody, @Req() req: JwtRequest): Promise<CustomerDto> {
    return this.customers.create(body, auditContext(req))
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMER_WRITE)
  update(@Param('id') id: string, @Body() body: UpdateCustomerBody, @Req() req: JwtRequest): Promise<CustomerDto> {
    return this.customers.update(id, body, auditContext(req))
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CUSTOMER_DELETE)
  async delete(@Param('id') id: string, @Req() req: JwtRequest): Promise<void> {
    await this.customers.softDelete(id, auditContext(req))
  }
}
