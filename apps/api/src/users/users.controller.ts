import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator'
import * as bcrypt from 'bcryptjs'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { UsersService } from './users.service'
import { permissionsFor, ROLE_PERMISSIONS } from '../auth/permissions'
import { validatePasswordPolicy } from '../auth/password-policy'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import { SERVICE_LINES } from '@bluefish/shared'
import type { RoleDto, UserDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class ChangePasswordDto {
  @IsString() @MinLength(6) currentPassword!: string
  @IsString() @MinLength(8) newPassword!: string
}

class UpdateSelfApiDto {
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() timezone?: string
}

class CreateUserApiDto {
  @IsEmail() email!: string
  @IsString() @MinLength(1) name!: string
  @IsString() @MinLength(1) role!: string
  @IsString() @MinLength(8) password!: string
  @IsOptional() @IsString() department?: string
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_LINES as readonly string[], { each: true }) services?: string[]
}

class UpdateUserApiDto {
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() role?: string
  @IsOptional() @IsString() department?: string | null
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_LINES as readonly string[], { each: true }) services?: string[]
  @IsOptional() @IsBoolean() isActive?: boolean
}

class AdminResetPasswordApiDto {
  @IsString() @MinLength(8) newPassword!: string
}

@Controller()
export class UsersController {
  constructor(private users: UsersService, private prisma: PrismaService, private audit: AuditService) {}

  @UseGuards(JwtAuthGuard)
  @Get('users/me')
  async me(@Req() req: JwtRequest): Promise<UserDto> {
    const id = req.user?.sub
    if (!id) throw new NotFoundException('User not found')
    const u = await this.users.findById(id)
    if (!u) throw new NotFoundException('User not found')
    return { ...this.users.toDto(u), permissions: permissionsFor(u.role.name) }
  }

  @UseGuards(JwtAuthGuard)
  @Patch('users/me')
  async updateSelf(@Body() body: UpdateSelfApiDto, @Req() req: JwtRequest): Promise<UserDto> {
    const id = req.user?.sub
    if (!id) throw new UnauthorizedException()
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.timezone !== undefined) {
      // Fail fast if the browser sent something Intl can't parse — otherwise Outlook would
      // reject the next push with a cryptic 400.
      try { new Intl.DateTimeFormat('en-CA', { timeZone: body.timezone }).format(new Date()) }
      catch { throw new BadRequestException(`Invalid timezone: ${body.timezone}`) }
      data.timezone = body.timezone
    }
    const updated = await this.prisma.user.update({ where: { id }, data, include: { role: true } })
    await this.audit.log({ ...auditContext(req), action: 'user.self_update', entity: 'user', entityId: id, after: data })
    return { ...this.users.toDto(updated), permissions: permissionsFor(updated.role.name) }
  }

  @UseGuards(JwtAuthGuard)
  @Get('users')
  async list(): Promise<UserDto[]> {
    const rows = await this.prisma.user.findMany({ include: { role: true }, orderBy: { name: 'asc' } })
    return rows.map((u) => this.users.toDto(u))
  }

  @UseGuards(JwtAuthGuard)
  @Get('roles')
  async roles(): Promise<RoleDto[]> {
    const rows = await this.prisma.role.findMany({ orderBy: { name: 'asc' } })
    return rows.map((r) => ({
      name: r.name,
      description: r.description,
      permissions: ROLE_PERMISSIONS[r.name] ?? [],
    }))
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @Post('users')
  async create(@Body() body: CreateUserApiDto, @Req() req: JwtRequest): Promise<UserDto> {
    const role = await this.prisma.role.findUnique({ where: { name: body.role } })
    if (!role) throw new BadRequestException(`Unknown role: ${body.role}`)
    const errors = validatePasswordPolicy(body.password)
    if (errors.length > 0) throw new BadRequestException(errors.join(', '))
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } })
    if (existing) throw new BadRequestException('Email already registered')
    const passwordHash = await bcrypt.hash(body.password, 10)
    const created = await this.prisma.user.create({
      data: {
        email: body.email, name: body.name, roleId: role.id, passwordHash,
        department: body.department ?? null, services: body.services ?? [],
      },
      include: { role: true },
    })
    await this.audit.log({ ...auditContext(req), action: 'user.create', entity: 'user', entityId: created.id, after: { email: created.email, role: role.name } })
    return this.users.toDto(created)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @Patch('users/:id')
  async update(@Param('id') id: string, @Body() body: UpdateUserApiDto, @Req() req: JwtRequest): Promise<UserDto> {
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: true } })
    if (!existing) throw new NotFoundException('User not found')
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name
    if (body.department !== undefined) data.department = body.department
    if (body.services !== undefined) data.services = body.services
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.role !== undefined) {
      const role = await this.prisma.role.findUnique({ where: { name: body.role } })
      if (!role) throw new BadRequestException(`Unknown role: ${body.role}`)
      data.roleId = role.id
    }
    const updated = await this.prisma.user.update({ where: { id }, data, include: { role: true } })
    await this.audit.log({ ...auditContext(req), action: 'user.update', entity: 'user', entityId: id, before: { role: existing.role.name, isActive: existing.isActive }, after: { role: updated.role.name, isActive: updated.isActive } })
    return this.users.toDto(updated)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @Post('users/:id/reset-password')
  @HttpCode(204)
  async adminReset(@Param('id') id: string, @Body() body: AdminResetPasswordApiDto, @Req() req: JwtRequest): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('User not found')
    const errors = validatePasswordPolicy(body.newPassword)
    if (errors.length > 0) throw new BadRequestException(errors.join(', '))
    const passwordHash = await bcrypt.hash(body.newPassword, 10)
    await this.prisma.user.update({ where: { id }, data: { passwordHash } })
    await this.audit.log({ ...auditContext(req), action: 'user.password.admin_reset', entity: 'user', entityId: id })
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @Delete('users/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Req() req: JwtRequest): Promise<void> {
    if (req.user?.sub === id) throw new BadRequestException('You cannot deactivate yourself')
    const existing = await this.prisma.user.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('User not found')
    await this.prisma.user.update({ where: { id }, data: { isActive: false } })
    await this.audit.log({ ...auditContext(req), action: 'user.deactivate', entity: 'user', entityId: id })
  }

  @UseGuards(JwtAuthGuard)
  @Post('users/me/change-password')
  @HttpCode(204)
  async changePassword(@Body() body: ChangePasswordDto, @Req() req: JwtRequest): Promise<void> {
    const id = req.user?.sub
    if (!id) throw new UnauthorizedException()
    const u = await this.users.findById(id)
    if (!u) throw new UnauthorizedException()
    const ok = await bcrypt.compare(body.currentPassword, u.passwordHash)
    if (!ok) throw new UnauthorizedException('Current password is incorrect')

    const errors = validatePasswordPolicy(body.newPassword)
    if (errors.length > 0) throw new UnauthorizedException(errors.join(', '))

    const passwordHash = await bcrypt.hash(body.newPassword, 10)
    await this.prisma.user.update({ where: { id }, data: { passwordHash } })
    await this.audit.log({ ...auditContext(req), action: 'user.password.change', entity: 'user', entityId: id })
  }
}
