import { validatePasswordPolicy } from './password-policy'

describe('validatePasswordPolicy', () => {
  it('accepts a valid password', () => {
    expect(validatePasswordPolicy('Str0ngPass')).toEqual([])
  })
  it('rejects short passwords', () => {
    const errs = validatePasswordPolicy('Sh0rt')
    expect(errs.some((e) => e.includes('8 characters'))).toBe(true)
  })
  it('requires an uppercase letter', () => {
    expect(validatePasswordPolicy('lowercase1')).toContain('Password must contain at least one uppercase letter')
  })
  it('requires a lowercase letter', () => {
    expect(validatePasswordPolicy('UPPERCASE1')).toContain('Password must contain at least one lowercase letter')
  })
  it('requires a digit', () => {
    expect(validatePasswordPolicy('NoDigits')).toContain('Password must contain at least one digit')
  })
})
