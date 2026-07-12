import { describe, expect, it } from 'vitest'
import * as OTPAuth from 'otpauth'
import { MfaService } from './mfa.service'

describe('MfaService.verifyCode', () => {
  const service = new MfaService({} as never)

  it('accepts the current TOTP', () => {
    const secret = new OTPAuth.Secret({ size: 20 }).base32
    const totp = new OTPAuth.TOTP({ issuer: 'Bluefish CRM', label: '_', algorithm: 'SHA1', digits: 6, period: 30, secret })
    const code = totp.generate()
    expect(service.verifyCode(secret, code)).toBe(true)
  })

  it('rejects an obviously wrong code', () => {
    const secret = new OTPAuth.Secret({ size: 20 }).base32
    expect(service.verifyCode(secret, '000000')).toBe(false)
  })

  it('rejects non-numeric strings', () => {
    expect(service.verifyCode('X', 'abcdef')).toBe(false)
  })
})
