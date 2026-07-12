import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common'
import { IsEmail, IsString, MinLength } from 'class-validator'
import { PasswordResetService } from './password-reset.service'
import { auditContext } from '../common/request-context'
import type { Request } from 'express'

class ForgotDto {
  @IsEmail() email!: string
}
class ResetDto {
  @IsString() token!: string
  @IsString() @MinLength(8) newPassword!: string
}

@Controller('auth')
export class PasswordResetController {
  constructor(private reset: PasswordResetService) {}

  @Post('forgot-password')
  @HttpCode(202)
  async forgot(@Body() body: ForgotDto, @Req() req: Request): Promise<{ ok: true }> {
    await this.reset.request(body.email, auditContext(req))
    return { ok: true }
  }

  @Post('reset-password')
  @HttpCode(204)
  async complete(@Body() body: ResetDto, @Req() req: Request): Promise<void> {
    await this.reset.complete(body.token, body.newPassword, auditContext(req))
  }
}
