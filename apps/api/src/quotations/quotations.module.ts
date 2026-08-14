import { Module } from '@nestjs/common'
import { QuotationsService } from './quotations.service'
import { QuotationsController } from './quotations.controller'
import { PdfService } from './pdf.service'
import { QuotationsEmailService } from './quotations-email.service'
import { FlowaccountModule } from '../integrations/flowaccount/flowaccount.module'

@Module({
  imports: [FlowaccountModule],
  providers: [QuotationsService, PdfService, QuotationsEmailService],
  controllers: [QuotationsController],
  exports: [QuotationsService, PdfService],
})
export class QuotationsModule {}
