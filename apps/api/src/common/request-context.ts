import type { Request } from 'express'

export function clientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string') return xff.split(',')[0].trim()
  return req.socket.remoteAddress ?? null
}

export interface AuditRequestContext {
  userId?: string
  ip: string | null
  userAgent: string | null
}

export function auditContext(req: Request): AuditRequestContext {
  const jwtPayload = (req as unknown as { user?: { sub?: string } }).user
  return {
    userId: jwtPayload?.sub,
    ip: clientIp(req),
    userAgent: req.headers['user-agent'] ?? null,
  }
}
