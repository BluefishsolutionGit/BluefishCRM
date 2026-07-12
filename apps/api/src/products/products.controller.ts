import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { ProductsService } from './products.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { ProductDto } from '@bluefish/shared'

class CreateProductBody {
  @IsString() @MinLength(1) code!: string
  @IsString() @MinLength(1) name!: string
  @IsOptional() @IsString() description?: string
  @IsInt() @Min(0) unitPrice!: number
  @IsOptional() @IsString() currency?: string
  @IsOptional() @IsBoolean() isActive?: boolean
}
class UpdateProductBody {
  @IsOptional() @IsString() code?: string
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsInt() @Min(0) unitPrice?: number
  @IsOptional() @IsString() currency?: string
  @IsOptional() @IsBoolean() isActive?: boolean
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get()
  @RequirePermissions('customer:read')
  list(@Query('all') all?: string): Promise<ProductDto[]> {
    return this.products.list(all === '1')
  }

  @Post()
  @RequirePermissions('user:manage')
  create(@Body() body: CreateProductBody, @Req() req: Request): Promise<ProductDto> {
    return this.products.create(body, auditContext(req))
  }

  @Patch(':id')
  @RequirePermissions('user:manage')
  update(@Param('id') id: string, @Body() body: UpdateProductBody, @Req() req: Request): Promise<ProductDto> {
    return this.products.update(id, body, auditContext(req))
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('user:manage')
  async delete(@Param('id') id: string, @Req() req: Request): Promise<void> {
    await this.products.delete(id, auditContext(req))
  }
}
