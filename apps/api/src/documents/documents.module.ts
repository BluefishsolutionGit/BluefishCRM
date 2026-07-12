import { Module } from '@nestjs/common'
import { DocumentsService } from './documents.service'
import { DocumentsController } from './documents.controller'
import { FileStorageService } from './file-storage.service'
import { OcrService } from './ocr.service'

@Module({
  providers: [DocumentsService, FileStorageService, OcrService],
  controllers: [DocumentsController],
  exports: [DocumentsService, FileStorageService, OcrService],
})
export class DocumentsModule {}
