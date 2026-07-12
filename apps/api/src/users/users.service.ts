import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { UserDto } from '@bluefish/shared'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email }, include: { role: true } })
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id }, include: { role: true } })
  }

  toDto(u: { id: string; email: string; name: string; role: { name: string } }): UserDto {
    return { id: u.id, email: u.email, name: u.name, role: u.role.name }
  }
}
