import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { MailerService } from '../mailer/mailer.service'
import { PdfService } from './pdf.service'
import { QuotationsService } from './quotations.service'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class QuotationsEmailService {
  constructor(
    private mailer: MailerService,
    private pdf: PdfService,
    private quotations: QuotationsService,
    private prisma: PrismaService,
  ) {}

  async sendQuotation(id: string, options: { toEmail?: string; ccEmails?: string[] }): Promise<void> {
    const q = await this.quotations.currentVersionWithLines(id)
    if (!q.currentVersion) throw new NotFoundException('Quotation has no version')
    if (q.status !== 'Approved' && q.status !== 'Sent') throw new BadRequestException('Only Approved quotations can be emailed')

    let toEmail = options.toEmail
    if (!toEmail) {
      const primary = await this.prisma.contact.findFirst({ where: { customerId: q.customerId, isPrimary: true } })
      toEmail = primary?.email
    }
    if (!toEmail) throw new BadRequestException('No recipient — set toEmail or mark a primary contact for the customer')

    const pdfBuffer = await this.pdf.renderQuotation(id)

    const grandTotal = new Intl.NumberFormat('en-US').format(q.currentVersion.grandTotal)
    await this.mailer.send({
      to: toEmail,
      cc: options.ccEmails,
      subject: `Quotation ${q.no} — ${q.customer.name}`,
      text: `Dear ${q.customer.name},

Please find attached quotation ${q.no} (version ${q.currentVersion.versionNo}).

Grand total: ฿${grandTotal}
Terms: ${q.currentVersion.terms}

If you have any questions, feel free to reply to this email.

Best regards,
${q.owner.name}
Bluefish CRM`,
      attachments: [{
        filename: `${q.no}-v${q.currentVersion.versionNo}.pdf`,
        contentType: 'application/pdf',
        content: pdfBuffer,
      }],
    })
  }
}
