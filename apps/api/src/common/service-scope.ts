import { PrismaService } from '../prisma/prisma.service'
import { permissionsFor, PERMISSIONS } from '../auth/permissions'
import type { Request } from 'express'

interface JwtRequest extends Request {
  user?: { sub: string; email: string; role: string }
  _bfServiceScope?: { services: string[]; viewAll: boolean; loaded: true }
}

/**
 * Loads the current user's service scope (services + view_all flag) exactly once
 * per request and memoizes the result on the request object. Callers can either
 * `await` this in a service or use `applyScope*` below.
 */
export async function loadServiceScope(prisma: PrismaService, req: Request): Promise<{ services: string[]; viewAll: boolean }> {
  const r = req as JwtRequest
  if (r._bfServiceScope) return r._bfServiceScope
  const perms = permissionsFor(r.user?.role ?? '')
  const viewAll = perms.includes(PERMISSIONS.SERVICE_VIEW_ALL)
  let services: string[] = []
  if (!viewAll && r.user?.sub) {
    const u = await prisma.user.findUnique({ where: { id: r.user.sub }, select: { services: true } })
    services = u?.services ?? []
  }
  const scope = { services, viewAll, loaded: true as const }
  r._bfServiceScope = scope
  return scope
}

/** True if the user can see everything. */
export function scopeIsUnbounded(scope: { services: string[]; viewAll: boolean }): boolean {
  return scope.viewAll
}

/**
 * If the user has view_all → returns nothing to change on the where clause.
 * Otherwise, returns a fragment that restricts by `serviceLines` (array field) with
 * Prisma's `hasSome`. If the user has zero services assigned, returns a filter
 * that matches nothing (safer than silently returning everything).
 */
export function scopeArrayField(scope: { services: string[]; viewAll: boolean }, field: string): Record<string, unknown> | null {
  if (scope.viewAll) return null
  if (scope.services.length === 0) return { [field]: { hasEvery: ['__none__'] } }
  return { [field]: { hasSome: scope.services } }
}

/** Same idea for a scalar column (e.g. Opportunity.serviceOrProduct). */
export function scopeScalarField(scope: { services: string[]; viewAll: boolean }, field: string): Record<string, unknown> | null {
  if (scope.viewAll) return null
  if (scope.services.length === 0) return { [field]: '__none__' }
  return { [field]: { in: scope.services } }
}
