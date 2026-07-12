import { Injectable, Logger } from '@nestjs/common'

export interface ExtractionResult {
  status: 'ready' | 'error'
  classification: string
  extractedText: string
  fields: Record<string, string | number | null>
  error?: string
}

const CATEGORY_KEYWORDS: Array<{ category: string; patterns: RegExp[] }> = [
  { category: 'tor', patterns: [/terms of reference/i, /ขอบเขต(งาน|ของงาน)?/i, /\btor\b/i, /specifications?/i] },
  { category: 'boq', patterns: [/\bboq\b/i, /bill of quantit(y|ies)/i, /รายการปริมาณ/i] },
  { category: 'contract', patterns: [/\bcontract\b/i, /agreement/i, /สัญญา/i, /master service agreement/i, /\bmsa\b/i] },
  { category: 'invoice', patterns: [/\binvoice\b/i, /invoice #/i, /ใบแจ้งหนี้/i, /amount due/i] },
  { category: 'quotation', patterns: [/\bquotation\b/i, /\bquote\b/i, /ใบเสนอราคา/i, /\bqt-\d/i] },
]

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name)

  async extract(buffer: Buffer, filename: string, mimeType: string): Promise<ExtractionResult> {
    try {
      let text = ''
      if (mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
        text = await this.extractPdfText(buffer)
      } else if (mimeType.startsWith('text/')) {
        text = buffer.toString('utf8')
      } else {
        // Image OCR would go here (Tesseract etc.). Not enabled in dev.
        return {
          status: 'ready',
          classification: this.classify(filename, ''),
          extractedText: '',
          fields: {},
        }
      }

      return {
        status: 'ready',
        classification: this.classify(filename, text),
        extractedText: text.slice(0, 20000),
        fields: this.extractFields(text),
      }
    } catch (err) {
      this.logger.error(`OCR failed for ${filename}`, err as Error)
      return {
        status: 'error', classification: 'other',
        extractedText: '', fields: {},
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('pdf-parse') as { PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> } }
    const parser = new mod.PDFParse({ data: buffer })
    const result = await parser.getText()
    return result.text ?? ''
  }

  private classify(filename: string, text: string): string {
    const haystack = `${filename} ${text.slice(0, 3000)}`
    for (const def of CATEGORY_KEYWORDS) {
      if (def.patterns.some((p) => p.test(haystack))) return def.category
    }
    return 'other'
  }

  private extractFields(text: string): Record<string, string | number | null> {
    const fields: Record<string, string | number | null> = {}

    // Currency amounts (largest wins for "budget" candidate)
    const amounts: number[] = []
    for (const m of text.matchAll(/(?:฿|thb\s*|baht\s*)?([1-9][\d,]{2,})(?:\.\d+)?/gi)) {
      const n = Number(m[1].replace(/,/g, ''))
      if (n >= 100_000 && n <= 1_000_000_000) amounts.push(n)
    }
    if (amounts.length > 0) fields.budget = Math.max(...amounts)

    // Dates ISO or dd/mm/yyyy
    const dateMatch = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/)
    if (dateMatch) fields.date = dateMatch[0]

    // Emails
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    if (emailMatch) fields.contactEmail = emailMatch[0]

    // Thai phone
    const phoneMatch = text.match(/0\d[-. ]?\d{3,4}[-. ]?\d{4}/)
    if (phoneMatch) fields.contactPhone = phoneMatch[0]

    // Tax IDs (13 digits)
    const taxMatch = text.match(/\b\d{13}\b/)
    if (taxMatch) fields.taxId = taxMatch[0]

    // Contract / quote numbers
    const quoteMatch = text.match(/\bQT-\d{4}-\d{4}\b/i)
    if (quoteMatch) fields.quotationNo = quoteMatch[0]
    const ctMatch = text.match(/\bCT-\d{4}-\d{4}\b/i)
    if (ctMatch) fields.contractNo = ctMatch[0]

    return fields
  }
}
