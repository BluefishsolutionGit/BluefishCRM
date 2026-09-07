import { Module } from '@nestjs/common'
import { CustomerVoiceService } from './customer-voice.service'
import { CustomerVoiceController } from './customer-voice.controller'

@Module({
  providers: [CustomerVoiceService],
  controllers: [CustomerVoiceController],
  exports: [CustomerVoiceService],
})
export class CustomerVoiceModule {}
