import { describe, expect, it } from 'vitest'
import { isMfaChallenge } from '../index'
import type { LoginOutcome } from '../index'

describe('isMfaChallenge', () => {
  it('returns true when the outcome carries an mfaToken', () => {
    const outcome: LoginOutcome = { requiresMfa: true, mfaToken: 'abc.xyz' }
    expect(isMfaChallenge(outcome)).toBe(true)
  })

  it('returns false for a fully-authenticated outcome', () => {
    const outcome: LoginOutcome = {
      accessToken: 'bearer',
      user: { id: 'u1', email: 'a@b', name: 'A', role: 'admin', permissions: ['customer:read'] },
    }
    expect(isMfaChallenge(outcome)).toBe(false)
  })
})
