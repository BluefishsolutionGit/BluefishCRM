import { Injectable, Logger } from '@nestjs/common'

export interface MailAttachment {
  filename: string
  contentType: string
  content: Buffer
}

export interface MailMessage {
  to: string
  cc?: string[]
  subject: string
  text: string
  attachments?: MailAttachment[]
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name)

  async send(message: MailMessage): Promise<void> {
    // Dev/local: log to console. Swap for SMTP/Resend in production.
    const cc = message.cc?.length ? ` cc=${message.cc.join(',')}` : ''
    const attach = message.attachments?.length
      ? ' attachments=' + message.attachments.map((a) => `${a.filename}(${Math.round(a.content.length / 1024)}KB)`).join(',')
      : ''
    this.logger.log(`Sending email: to=${message.to}${cc} subject=${message.subject}${attach}`)
    this.logger.log(`--- BODY ---\n${message.text}\n--- END ---`)
  }
}
