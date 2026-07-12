import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSIONS_KEY } from './permissions.decorator'
import { permissionsFor, type Permission } from './permissions'
import type { Request } from 'express'

interface JwtRequest extends Request {
  user?: { sub: string; email: string; role: string }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) return true

    const req = context.switchToHttp().getRequest<JwtRequest>()
    const role = req.user?.role
    if (!role) throw new ForbiddenException('No role attached to session')

    const owned = permissionsFor(role)
    const missing = required.filter((p) => !owned.includes(p))
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission(s): ${missing.join(', ')}`)
    }
    return true
  }
}
