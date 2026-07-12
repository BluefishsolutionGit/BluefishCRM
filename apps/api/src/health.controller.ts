import { Controller, Get, Header, InternalServerErrorException } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { PrismaService } from './prisma/prisma.service'
import { httpMetrics } from './common/http-metrics'

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get('health')
  check() {
    return { status: 'ok', uptime: process.uptime() }
  }

  @Get('health/detailed')
  async detailed() {
    let db: 'ok' | 'error' = 'ok'
    let dbLatencyMs = 0
    const started = Date.now()
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1')
      dbLatencyMs = Date.now() - started
    } catch {
      db = 'error'
      dbLatencyMs = Date.now() - started
    }
    const memory = process.memoryUsage()
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? 'dev',
      nodeVersion: process.version,
      checks: { db, dbLatencyMs },
      memory: { rssMB: Math.round(memory.rss / 1e6), heapUsedMB: Math.round(memory.heapUsed / 1e6) },
    }
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics() {
    try {
      return httpMetrics.prometheusText()
    } catch (e) {
      throw new InternalServerErrorException(e instanceof Error ? e.message : 'metrics failed')
    }
  }
}
