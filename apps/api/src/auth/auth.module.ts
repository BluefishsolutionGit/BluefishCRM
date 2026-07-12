import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './jwt.strategy'
import { PermissionsGuard } from './permissions.guard'
import { TokensService } from './tokens.service'
import { PasswordResetService } from './password-reset.service'
import { PasswordResetController } from './password-reset.controller'
import { SsoController } from './sso.controller'
import { SsoService } from './sso.service'
import { MfaService } from './mfa.service'
import { UsersModule } from '../users/users.module'

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
        signOptions: { expiresIn: cfg.get<string>('JWT_EXPIRES_IN') ?? '12h' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, PermissionsGuard, TokensService, PasswordResetService, MfaService, SsoService],
  controllers: [AuthController, PasswordResetController, SsoController],
  exports: [PermissionsGuard, TokensService, MfaService],
})
export class AuthModule {}
