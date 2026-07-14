import { Module } from '@nestjs/common'
import { OpportunitiesService } from './opportunities.service'
import { OpportunitiesController } from './opportunities.controller'
import { OpportunitiesImportController } from './opportunities-import.controller'

@Module({
  providers: [OpportunitiesService],
  // ImportController FIRST so /opportunities/import-template + /opportunities/export
  // + /opportunities/import don't get shadowed by /opportunities/:id.
  controllers: [OpportunitiesImportController, OpportunitiesController],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
