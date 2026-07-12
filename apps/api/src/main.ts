import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import type { NextFunction, Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { AppModule } from './app.module'
import { httpMetrics } from './common/http-metrics'

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production'
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
      credentials: true,
    },
  })

  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  )

  app.use((req: Request, res: Response, next: NextFunction) => {
    const id = (req.headers['x-request-id'] as string) ?? randomUUID()
    ;(req as Request & { requestId: string }).requestId = id
    res.setHeader('x-request-id', id)
    const start = Date.now()
    res.on('finish', () => {
      httpMetrics.record(req.method, req.originalUrl.split('?')[0], res.statusCode, Date.now() - start)
    })
    next()
  })

  app.use(cookieParser())
  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  const port = process.env.PORT ? Number(process.env.PORT) : 4000
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}/api`)
}
bootstrap()
