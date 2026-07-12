import { Module } from '@nestjs/common'
import { CustomersService } from './customers.service'
import { CustomersController } from './customers.controller'
import { CustomersImportController } from './customers-import.controller'

@Module({
  providers: [CustomersService],
  // ImportController registered first so /customers/import-template + /customers/import
  // don't collide with the /:id route on CustomersController.
  controllers: [CustomersImportController, CustomersController],
})
export class CustomersModule {}
