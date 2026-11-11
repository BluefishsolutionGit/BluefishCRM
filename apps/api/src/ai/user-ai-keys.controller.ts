import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common'
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt.guard'
import { UserAiKeysService } from './user-ai-keys.service'
import type { Request } from 'express'
import type { AiKeyDto, AiKeyProvider, TestAiKeyResultDto } from '@bluefish/shared'

interface JwtRequest extends Request { user?: { sub: string; email: string; role: string } }

class CreateAiKeyBody {
  @IsIn(['anthropic']) provider!: AiKeyProvider
  @IsOptional() @IsString() label?: string
  @IsString() @MinLength(20) apiKey!: string
}

// Authenticated self-serve: no admin-only permission on these — every logged-in
// user manages their own keys. Writes are scoped to `req.user.sub` so nobody
// can touch anyone else's keys.
@UseGuards(JwtAuthGuard)
@Controller('me/ai-keys')
export class UserAiKeysController {
  constructor(private svc: UserAiKeysService) {}

  @Get()
  list(@Req() req: JwtRequest): Promise<AiKeyDto[]> {
    if (!req.user) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    return this.svc.list(req.user.sub)
  }

  @Post()
  create(@Req() req: JwtRequest, @Body() body: CreateAiKeyBody): Promise<AiKeyDto> {
    if (!req.user) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    return this.svc.create(req.user.sub, body)
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Req() req: JwtRequest, @Param('id') id: string): Promise<void> {
    if (!req.user) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    await this.svc.delete(req.user.sub, id)
  }

  @Post(':id/test')
  test(@Req() req: JwtRequest, @Param('id') id: string): Promise<TestAiKeyResultDto> {
    if (!req.user) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    return this.svc.test(req.user.sub, id)
  }
}
