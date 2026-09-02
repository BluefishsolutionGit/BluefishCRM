import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import type { ScanCardResultDto } from '@bluefish/shared'

const EXTRACT_PROMPT = `You are extracting structured contact info from a business-card image.

Reply with ONLY a single JSON object (no prose, no code fences) matching this exact shape:
{
  "companyName": string | null,
  "taxId": string | null,
  "contactName": string | null,
  "firstName": string | null,
  "lastName": string | null,
  "position": string | null,
  "department": string | null,
  "email": string | null,
  "mobile": string | null,
  "telephone": string | null,
  "website": string | null,
  "address": string | null,
  "city": string | null,
  "notes": string | null
}

Rules:
- If a field is missing from the card, use null. Do not invent data.
- "contactName" is the full display name; also split into firstName / lastName.
- "mobile" is the personal cell number; "telephone" is the office/landline.
- "taxId" is a Thai 13-digit or generic tax id if present.
- Preserve Thai script as-is.
- Trim whitespace. Do not include titles like "Mr./Mrs." in firstName/lastName.`

const EMPTY: Omit<ScanCardResultDto, 'raw'> = {
  companyName: null, taxId: null, contactName: null, firstName: null, lastName: null,
  position: null, department: null, email: null, mobile: null, telephone: null,
  website: null, address: null, city: null, notes: null,
}

@Injectable()
export class CardScanService {
  private readonly logger = new Logger(CardScanService.name)
  private client: Anthropic | null = null

  constructor(private cfg: ConfigService) {
    const key = cfg.get<string>('ANTHROPIC_API_KEY')
    if (key) this.client = new Anthropic({ apiKey: key })
  }

  /**
   * Multi-side entry: vision each side, then merge into one record.
   * Front usually has the primary fields; back often carries the Thai
   * variant, extra phones, or the corporate reg number. Merge picks the
   * richer value per field so both sides contribute.
   */
  async extractMulti(sides: Array<{ buffer: Buffer; mimeType: string }>): Promise<ScanCardResultDto> {
    if (sides.length === 0) return { ...EMPTY, raw: null }
    if (sides.length === 1) return this.extract(sides[0].buffer, sides[0].mimeType)
    const results = await Promise.all(sides.map((s) => this.extract(s.buffer, s.mimeType)))
    return mergeSides(results)
  }

  async extract(buffer: Buffer, mimeType: string): Promise<ScanCardResultDto> {
    if (!this.client) return this.mock()

    const model = this.cfg.get<string>('AI_VISION_MODEL') ?? this.cfg.get<string>('AI_DEFAULT_MODEL') ?? 'claude-haiku-4-5-20251001'
    const b64 = buffer.toString('base64')
    const mediaType = normalizeMediaType(mimeType)

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: 700,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        }],
      })

      const text = response.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
        .trim()

      const parsed = safeJson(text)
      if (!parsed) {
        this.logger.warn('Vision returned non-JSON — falling back to empty result')
        return { ...EMPTY, raw: text.slice(0, 4000) }
      }
      return { ...EMPTY, ...parsed, raw: text.slice(0, 4000) }
    } catch (err) {
      this.logger.error('Vision extract failed', err as Error)
      return this.mock()
    }
  }

  /** Deterministic demo card for when no API key is configured or the model errors out. */
  private mock(): ScanCardResultDto {
    return {
      companyName: 'Siam Solutions Co., Ltd.',
      taxId: '0105562015678',
      contactName: 'Somchai Chareonkul',
      firstName: 'Somchai',
      lastName: 'Chareonkul',
      position: 'Head of IT Operations',
      department: 'Information Technology',
      email: 'somchai.c@siamsolutions.co.th',
      mobile: '081-234-5678',
      telephone: '02-345-6789',
      website: 'www.siamsolutions.co.th',
      address: '99 Silom Road, Bangrak, Bangkok 10500',
      city: 'Bangkok',
      notes: null,
      raw: '[mock — set ANTHROPIC_API_KEY to enable real vision extraction]',
    }
  }
}

function safeJson(text: string): Partial<ScanCardResultDto> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as Partial<ScanCardResultDto>
  } catch { return null }
}

/** Take the more informative value between sides for each field.
 *  Notes are concatenated (front's notes + back's notes, deduped).
 *  Raw is joined with a separator so the caller can debug both sides. */
function mergeSides(results: ScanCardResultDto[]): ScanCardResultDto {
  const merged: ScanCardResultDto = { ...EMPTY, raw: null }
  const stringKeys = Object.keys(EMPTY) as Array<keyof typeof EMPTY>
  for (const r of results) {
    for (const k of stringKeys) {
      const cur = merged[k]
      const nxt = r[k]
      if (!nxt) continue
      if (!cur || String(nxt).length > String(cur).length) {
        (merged as unknown as Record<string, string | null>)[k] = nxt
      }
    }
  }
  const notes = Array.from(new Set(results.map((r) => r.notes).filter(Boolean))) as string[]
  if (notes.length > 0) merged.notes = notes.join(' · ')
  const rawParts = results.map((r) => r.raw).filter(Boolean) as string[]
  if (rawParts.length > 0) merged.raw = rawParts.map((p, i) => `-- side ${i + 1} --\n${p}`).join('\n\n')
  return merged
}

function normalizeMediaType(input: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  const t = input.toLowerCase()
  if (t.includes('png')) return 'image/png'
  if (t.includes('gif')) return 'image/gif'
  if (t.includes('webp')) return 'image/webp'
  return 'image/jpeg'
}
