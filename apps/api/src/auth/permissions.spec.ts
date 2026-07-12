import { describe, expect, it } from 'vitest'
import { PERMISSIONS, permissionsFor } from './permissions'

describe('permissionsFor', () => {
  it('admin has every permission', () => {
    const admin = permissionsFor('admin')
    for (const perm of Object.values(PERMISSIONS)) {
      expect(admin).toContain(perm)
    }
  })

  it('sales_rep can read and write customers but not delete', () => {
    const perms = permissionsFor('sales_rep')
    expect(perms).toContain(PERMISSIONS.CUSTOMER_READ)
    expect(perms).toContain(PERMISSIONS.CUSTOMER_WRITE)
    expect(perms).not.toContain(PERMISSIONS.CUSTOMER_DELETE)
    expect(perms).not.toContain(PERMISSIONS.AUDIT_READ)
  })

  it('auditor can read audit log but cannot write customers', () => {
    const perms = permissionsFor('auditor')
    expect(perms).toContain(PERMISSIONS.AUDIT_READ)
    expect(perms).toContain(PERMISSIONS.CUSTOMER_READ)
    expect(perms).not.toContain(PERMISSIONS.CUSTOMER_WRITE)
  })

  it('legal can approve legal step on contracts but nothing else on quotations', () => {
    const perms = permissionsFor('legal')
    expect(perms).toContain(PERMISSIONS.CONTRACT_APPROVE_LEGAL)
    expect(perms).not.toContain(PERMISSIONS.QUOTATION_APPROVE)
  })

  it('returns an empty list for an unknown role', () => {
    expect(permissionsFor('unknown_role')).toEqual([])
  })
})
