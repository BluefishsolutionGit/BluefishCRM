import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { ContactsService } from './contacts.service'
import { clientIp } from '../common/request-context'
import type { Request } from 'express'
import type { ContactDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class CreateContactBody {
  @IsString() @MinLength(1) name!: string
  @IsString() role!: string
  @IsString() phone!: string
  @IsEmail() email!: string
  @IsOptional() @IsBoolean() isPrimary?: boolean
}
class UpdateContactBody {
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() role?: string
  @IsOptional() @IsString() phone?: string
  @IsOptional() @IsEmail() email?: string
  @IsOptional() @IsBoolean() isPrimary?: boolean
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ContactsController {
  constructor(private contacts: ContactsService) {}

  @Get('customers/:customerId/contacts')
  @RequirePermissions(PERMISSIONS.CONTACT_READ)
  list(@Param('customerId') customerId: string): Promise<ContactDto[]> {
    return this.contacts.listByCustomer(customerId)
  }

  @Post('customers/:customerId/contacts')
  @RequirePermissions(PERMISSIONS.CONTACT_WRITE)
  create(@Param('customerId') customerId: string, @Body() body: CreateContactBody, @Req() req: JwtRequest): Promise<ContactDto> {
    return this.contacts.create(customerId, body, { userId: req.user?.sub, ip: clientIp(req), userAgent: req.headers['user-agent'] ?? null })
  }

  @Patch('contacts/:id')
  @RequirePermissions(PERMISSIONS.CONTACT_WRITE)
  update(@Param('id') id: string, @Body() body: UpdateContactBody, @Req() req: JwtRequest): Promise<ContactDto> {
    return this.contacts.update(id, body, { userId: req.user?.sub, ip: clientIp(req), userAgent: req.headers['user-agent'] ?? null })
  }

  @Delete('contacts/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CONTACT_WRITE)
  async delete(@Param('id') id: string, @Req() req: JwtRequest): Promise<void> {
    await this.contacts.delete(id, { userId: req.user?.sub, ip: clientIp(req), userAgent: req.headers['user-agent'] ?? null })
  }
}
