import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'

const CHALLENGE_TTL_MS = 5 * 60 * 1000

@Injectable()
export class WebAuthnService {
  private readonly logger = new Logger(WebAuthnService.name)
  private readonly rpID: string
  private readonly rpName = 'Bluefish CRM'
  private readonly origin: string

  constructor(private prisma: PrismaService, private users: UsersService, config: ConfigService) {
    this.rpID = config.get<string>('WEBAUTHN_RP_ID') ?? 'localhost'
    this.origin = config.get<string>('WEBAUTHN_ORIGIN') ?? 'http://localhost:5173'
  }

  /** ── Registration ─────────────────────────────────────────── */
  async beginRegistration(userId: string) {
    const user = await this.users.findById(userId)
    if (!user) throw new NotFoundException()
    const existing = await this.prisma.webAuthnCredential.findMany({ where: { userId }, select: { credentialId: true, transports: true } })

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userName: user.email,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: (c.transports as AuthenticatorTransportFuture[]) ?? undefined,
      })),
    })

    await this.storeChallenge(userId, 'register', options.challenge)
    return options
  }

  async finishRegistration(userId: string, body: RegistrationResponseJSON, deviceLabel?: string) {
    const challenge = await this.consumeChallenge(userId, 'register')
    let verification
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
      })
    } catch (e) {
      throw new BadRequestException(`Verification failed: ${(e as Error).message}`)
    }
    if (!verification.verified || !verification.registrationInfo) throw new BadRequestException('Not verified')

    const info = verification.registrationInfo
    const cred = info.credential
    await this.prisma.webAuthnCredential.upsert({
      where: { credentialId: cred.id },
      update: { publicKey: Buffer.from(cred.publicKey), counter: BigInt(cred.counter ?? 0), userId, deviceLabel: deviceLabel ?? null, transports: cred.transports ?? [] },
      create: {
        userId, credentialId: cred.id, publicKey: Buffer.from(cred.publicKey),
        counter: BigInt(cred.counter ?? 0), transports: cred.transports ?? [], deviceLabel: deviceLabel ?? null,
      },
    })
    return { verified: true }
  }

  /** ── Authentication ───────────────────────────────────────── */
  async beginAuthentication(email: string) {
    const user = await this.users.findByEmail(email)
    // Even if user doesn't exist we return options with no allowCredentials —
    // avoids revealing which emails have a webauthn credential.
    const creds = user
      ? await this.prisma.webAuthnCredential.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } })
      : []

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'preferred',
      allowCredentials: creds.map((c) => ({
        id: c.credentialId,
        transports: (c.transports as AuthenticatorTransportFuture[]) ?? undefined,
      })),
    })

    await this.storeChallenge(user?.id ?? null, 'authenticate', options.challenge)
    return { options, hasCredentials: creds.length > 0 }
  }

  async finishAuthentication(email: string, body: AuthenticationResponseJSON): Promise<{ userId: string }> {
    const user = await this.users.findByEmail(email)
    if (!user) throw new UnauthorizedException()

    const cred = await this.prisma.webAuthnCredential.findUnique({ where: { credentialId: body.id } })
    if (!cred || cred.userId !== user.id) throw new UnauthorizedException('Unknown credential')

    const challenge = await this.consumeChallenge(user.id, 'authenticate')

    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: {
          id: cred.credentialId,
          publicKey: new Uint8Array(cred.publicKey),
          counter: Number(cred.counter),
          transports: cred.transports as AuthenticatorTransportFuture[],
        },
      })
    } catch (e) {
      throw new UnauthorizedException(`WebAuthn verify failed: ${(e as Error).message}`)
    }
    if (!verification.verified) throw new UnauthorizedException('Not verified')

    await this.prisma.webAuthnCredential.update({
      where: { credentialId: cred.credentialId },
      data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
    })
    return { userId: user.id }
  }

  /** ── User-facing credential management ────────────────────── */
  async listCredentials(userId: string) {
    const creds = await this.prisma.webAuthnCredential.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' },
    })
    return creds.map((c) => ({
      id: c.id,
      deviceLabel: c.deviceLabel,
      transports: c.transports,
      createdAt: c.createdAt.toISOString(),
      lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
    }))
  }

  async deleteCredential(userId: string, id: string): Promise<void> {
    const cred = await this.prisma.webAuthnCredential.findFirst({ where: { id, userId } })
    if (!cred) throw new NotFoundException()
    await this.prisma.webAuthnCredential.delete({ where: { id } })
  }

  /** ── Challenge storage ────────────────────────────────────── */
  private async storeChallenge(userId: string | null, purpose: 'register' | 'authenticate', challenge: string) {
    // Wipe any previous outstanding challenge for the same (user, purpose) pair
    if (userId) {
      await this.prisma.webAuthnChallenge.deleteMany({ where: { userId, purpose } })
    }
    await this.prisma.webAuthnChallenge.create({
      data: {
        userId, purpose, challenge,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    })
  }

  private async consumeChallenge(userId: string, purpose: 'register' | 'authenticate'): Promise<string> {
    const row = await this.prisma.webAuthnChallenge.findFirst({
      where: { userId, purpose, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!row) throw new UnauthorizedException('Challenge expired — start again')
    await this.prisma.webAuthnChallenge.delete({ where: { id: row.id } }).catch(() => {})
    return row.challenge
  }
}
