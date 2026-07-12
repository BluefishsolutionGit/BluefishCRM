import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { MailerService } from '../mailer/mailer.service'
import { AuditService } from '../audit/audit.service'
import type { EnvelopeDto, EnvelopeStatus, SendForSignatureDto } from '@bluefish/shared'
import type { AuditRequestContext } from '../common/request-context'

/**
 * Provider-agnostic e-Sign wrapper. Ships with a "stub" provider that emails a
 * pretend "sign here" link and marks the envelope signed when the callback URL
 * is hit. DocuSign / Adobe Sign / ETDA plug in behind the same interface.
 */
@Injectable()
export class EsignService {
  private readonly logger = new Logger(EsignService.name)

  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
    private audit: AuditService,
    private cfg: ConfigService,
  ) {}

  async sendForSignature(contractId: string, input: SendForSignatureDto, userId: string, ctx: AuditRequestContext): Promise<EnvelopeDto> {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId }, include: { currentVersion: true } })
    if (!contract) throw new NotFoundException('Contract not found')
    if (!contract.currentVersion) throw new BadRequestException('Contract has no version')
    if (!['Approved', 'Signed'].includes(contract.status)) {
      throw new BadRequestException('Only Approved contracts can be sent for signature')
    }

    const externalId = 'ENV-' + crypto.randomBytes(6).toString('hex').toUpperCase()
    const callbackToken = crypto.randomBytes(24).toString('base64url')
    const base = this.cfg.get<string>('WEB_BASE_URL') ?? 'http://localhost:5173'
    const signUrl = `${base}/esign/${externalId}?token=${callbackToken}`

    const envelope = await this.prisma.esignEnvelope.create({
      data: {
        contractId, provider: 'stub', externalId,
        signerEmail: input.signerEmail, signerName: input.signerName,
        callbackToken, createdById: userId, status: 'sent',
      },
    })

    await this.mailer.send({
      to: input.signerEmail,
      subject: `Please sign contract ${contract.no}`,
      text: `Hello ${input.signerName},

Please review and sign contract ${contract.no}:
  ${signUrl}

This link is unique to you and expires in 14 days.

Thank you,
Bluefish CRM`,
    })

    await this.audit.log({
      ...ctx, action: 'contract.esign.send', entity: 'contract', entityId: contractId,
      metadata: { envelopeId: externalId, signerEmail: input.signerEmail },
    })

    return this.toDto(envelope, signUrl)
  }

  async listForContract(contractId: string): Promise<EnvelopeDto[]> {
    const rows = await this.prisma.esignEnvelope.findMany({ where: { contractId }, orderBy: { sentAt: 'desc' } })
    const base = this.cfg.get<string>('WEB_BASE_URL') ?? 'http://localhost:5173'
    return rows.map((r) => this.toDto(r, `${base}/esign/${r.externalId}?token=${r.callbackToken}`))
  }

  /**
   * Simulated signer callback. In production the vendor calls this with a
   * signed HMAC and event data; here we just accept the token.
   */
  async recordSignature(externalId: string, callbackToken: string): Promise<{ contractId: string; status: EnvelopeStatus }> {
    const envelope = await this.prisma.esignEnvelope.findUnique({ where: { externalId } })
    if (!envelope) throw new NotFoundException()
    if (envelope.callbackToken !== callbackToken) throw new BadRequestException('Invalid token')
    if (envelope.status === 'signed') return { contractId: envelope.contractId, status: 'signed' }

    await this.prisma.esignEnvelope.update({
      where: { id: envelope.id },
      data: { status: 'signed', completedAt: new Date() },
    })

    // Reflect the sign on the contract
    const contract = await this.prisma.contract.findUnique({ where: { id: envelope.contractId } })
    if (contract) {
      const now = new Date()
      const shouldActivate = contract.startDate && contract.startDate <= now
      await this.prisma.contract.update({
        where: { id: envelope.contractId },
        data: { status: shouldActivate ? 'Active' : 'Signed', signedAt: now },
      })
    }
    await this.audit.log({
      action: 'contract.esign.completed', entity: 'contract', entityId: envelope.contractId,
      metadata: { envelopeId: externalId },
    })
    return { contractId: envelope.contractId, status: 'signed' }
  }

  private toDto(row: { id: string; contractId: string; provider: string; externalId: string; signerEmail: string; signerName: string; status: string; sentAt: Date; completedAt: Date | null }, signUrl: string): EnvelopeDto {
    return {
      id: row.id, contractId: row.contractId, provider: row.provider,
      externalId: row.externalId, signerEmail: row.signerEmail, signerName: row.signerName,
      status: row.status as EnvelopeStatus,
      sentAt: row.sentAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      signUrl,
    }
  }
}
