import { Module } from '@nestjs/common'
import { IndustryTypesService } from './industry-types.service'
import { IndustryTypesController } from './master-data.controller'

@Module({
  providers: [IndustryTypesService],
  controllers: [IndustryTypesController],
})
export class MasterDataModule {}
