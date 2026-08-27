import { Logger } from '@nestjs/common'
import * as crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 12          // GCM standard IV length
const TAG_LEN = 16

const logger = new Logger('IntegrationCrypto')

let cachedKey: Buffer | null = null

/**
 * Resolve the encryption key from `INTEGRATION_ENC_KEY`. Accepts either a
 * base64 blob (32 bytes decoded) or a plain string (SHA-256'd to 32 bytes).
 *
 * When the env var is missing we fall back to a deterministic dev key derived
 * from a fixed marker string — this keeps `npm run dev` working, but every
 * production deployment MUST set the env var. A warning is logged once.
 */
function loadKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.INTEGRATION_ENC_KEY
  if (!raw) {
    logger.warn('INTEGRATION_ENC_KEY not set — using dev fallback. DO NOT USE THIS IN PRODUCTION.')
    cachedKey = crypto.createHash('sha256').update('bluefish-dev-integration-key').digest()
    return cachedKey
  }

  // Try base64 first; if it decodes to exactly 32 bytes, use as-is.
  try {
    const decoded = Buffer.from(raw, 'base64')
    if (decoded.length === KEY_LEN) {
      cachedKey = decoded
      return cachedKey
    }
  } catch { /* not base64 — fall through */ }

  cachedKey = crypto.createHash('sha256').update(raw).digest()
  return cachedKey
}

/**
 * Encrypt a JSON-serializable secret payload to a base64 string. Output layout:
 *   base64( iv[12] || authTag[16] || ciphertext )
 * Decrypt is the inverse — use `decryptSecret`.
 */
export function encryptSecret(payload: unknown): string {
  const key = loadKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload ?? {}), 'utf8')
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

/**
 * Decrypt a blob produced by `encryptSecret`. Returns `null` if the input is
 * empty/garbled — callers should treat that as "no credentials configured"
 * rather than crash.
 */
export function decryptSecret<T = Record<string, string>>(blob: string | null | undefined): T | null {
  if (!blob) return null
  try {
    const key = loadKey()
    const buf = Buffer.from(blob, 'base64')
    if (buf.length < IV_LEN + TAG_LEN + 1) return null
    const iv = buf.subarray(0, IV_LEN)
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const ct = buf.subarray(IV_LEN + TAG_LEN)
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
    return JSON.parse(pt) as T
  } catch (err) {
    logger.error(`decryptSecret failed: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

/** Mask a secret string for display — keeps first 4 and last 4 chars. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return ''
  if (value.length <= 8) return '••••'
  return value.slice(0, 4) + '••••' + value.slice(-4)
}
