import { Injectable, UnauthorizedException } from '@nestjs/common'
import * as OTPAuth from 'otpauth'
import { PrismaService } from '../prisma/prisma.service'

const APP_NAME = 'Bluefish CRM'

@Injectable()
export class MfaService {
  constructor(private prisma: PrismaService) {}

  async initSetup(userId: string): Promise<{ secret: string; otpauth: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('User not found')

    const secret = new OTPAuth.Secret({ size: 20 }).base32
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } })

    const totp = new OTPAuth.TOTP({
      issuer: APP_NAME, label: user.email,
      algorithm: 'SHA1', digits: 6, period: 30, secret,
    })
    return { secret, otpauth: totp.toString() }
  }

  async verifyAndEnable(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.mfaSecret) throw new UnauthorizedException('MFA setup has not been started')
    if (!this.verifyCode(user.mfaSecret, code)) throw new UnauthorizedException('Invalid MFA code')
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } })
  }

  async disable(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.mfaSecret || !user.mfaEnabled) throw new UnauthorizedException('MFA is not active')
    if (!this.verifyCode(user.mfaSecret, code)) throw new UnauthorizedException('Invalid MFA code')
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: null, mfaEnabled: false } })
  }

  verifyCode(secret: string, code: string): boolean {
    if (!/^\d{6}$/.test(code)) return false
    const totp = new OTPAuth.TOTP({ issuer: APP_NAME, label: '_', algorithm: 'SHA1', digits: 6, period: 30, secret })
    return totp.validate({ token: code, window: 1 }) !== null
  }
}
