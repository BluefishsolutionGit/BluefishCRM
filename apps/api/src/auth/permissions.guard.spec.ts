import { describe, expect, it, vi } from 'vitest'
import { Reflector } from '@nestjs/core'
import { ForbiddenException } from '@nestjs/common'
import { PermissionsGuard } from './permissions.guard'
import { PERMISSIONS } from './permissions'

function makeContext(role: string | undefined, required: string[] | undefined) {
  const reflector = new Reflector()
  ;(reflector.getAllAndOverride as unknown as (...args: unknown[]) => unknown) = vi.fn(() => required)
  const guard = new PermissionsGuard(reflector)
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { guard, ctx: ctx as any }
}

describe('PermissionsGuard', () => {
  it('allows when no permissions are required', () => {
    const { guard, ctx } = makeContext('sales_rep', undefined)
    expect(guard.canActivate(ctx)).toBe(true)
  })

  it('allows when role has all required permissions', () => {
    const { guard, ctx } = makeContext('sales_manager', [PERMISSIONS.CUSTOMER_WRITE, PERMISSIONS.CUSTOMER_READ])
    expect(guard.canActivate(ctx)).toBe(true)
  })

  it('rejects when role is missing a permission', () => {
    const { guard, ctx } = makeContext('sales_rep', [PERMISSIONS.CUSTOMER_DELETE])
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException)
  })

  it('rejects when no role is attached', () => {
    const { guard, ctx } = makeContext(undefined, [PERMISSIONS.CUSTOMER_READ])
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException)
  })
})
