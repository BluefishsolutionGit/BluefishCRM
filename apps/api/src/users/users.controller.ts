import { Body, Controller, Get, HttpCode, NotFoundException, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common'
import { IsString, MinLength } from 'class-validator'
import * as bcrypt from 'bcryptjs'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { UsersService } from './users.service'
import { permissionsFor } from '../auth/permissions'
import { validatePasswordPolicy } from '../auth/password-policy'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'
import type { UserDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class ChangePasswordDto {
  @IsString() @MinLength(6) currentPassword!: string
  @IsString() @MinLength(8) newPassword!: string
}

@Controller('users')
export class UsersController {
  constructor(private users: UsersService, private prisma: PrismaService, private audit: AuditService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: JwtRequest): Promise<UserDto> {
    const id = req.user?.sub
    if (!id) throw new NotFoundException('User not found')
    const u = await this.users.findById(id)
    if (!u) throw new NotFoundException('User not found')
    return { ...this.users.toDto(u), permissions: permissionsFor(u.role.name) }
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(): Promise<UserDto[]> {
    const rows = await this.prisma.user.findMany({ include: { role: true }, orderBy: { name: 'asc' } })
    return rows.map((u) => this.users.toDto(u))
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/change-password')
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
