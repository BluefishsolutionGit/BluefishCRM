import { Module } from '@nestjs/common'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { MfaController } from './mfa.controller'
import { MfaService } from '../auth/mfa.service'

@Module({
  providers: [UsersService, MfaService],
  controllers: [UsersController, MfaController],
  exports: [UsersService, MfaService],
})
export class UsersModule {}
