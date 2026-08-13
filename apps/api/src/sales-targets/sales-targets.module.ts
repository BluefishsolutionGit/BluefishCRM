import { Module } from '@nestjs/common'
import { SalesTargetsController } from './sales-targets.controller'

@Module({
  controllers: [SalesTargetsController],
})
export class SalesTargetsModule {}
