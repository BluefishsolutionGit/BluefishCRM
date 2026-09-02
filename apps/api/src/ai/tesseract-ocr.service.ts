/**
 * Self-hosted OCR fallback using tesseract.js — no external API required.
 *
 * When to use vs. Anthropic:
 *   - Anthropic: card is stylized (logos, gradients, decorative fonts,
 *     rotated, low light). Vision LLMs handle those; Tesseract doesn't.
 *   - Tesseract: plain-print corporate cards, offline capture, no budget
 *     for API calls. Data stays on the box.
 *
 * The service loads a shared Tesseract worker once per process and reuses
 * it — first OCR call incurs ~2-3s model download; subsequent calls
 * usually finish in 1-2s per side on a small VPS.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { createWorker, type Worker } from 'tesseract.js'

@Injectable()
export class TesseractOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(TesseractOcrService.name)
  private worker: Worker | null = null
  private ready: Promise<Worker> | null = null

  private async getWorker(): Promise<Worker> {
    if (this.worker) return this.worker
    if (this.ready) return this.ready
    this.ready = (async () => {
      // eng + tha covers ~95% of Thai B2B cards. Adding chi/jpn would push
      // model download over ~50MB, defer until asked.
      const w = await createWorker(['eng', 'tha'])
      this.logger.log('Tesseract worker ready (eng+tha)')
      this.worker = w
      return w
    })()
    return this.ready
  }

  async recognize(buffer: Buffer): Promise<string> {
    const worker = await this.getWorker()
    const { data } = await worker.recognize(buffer)
    return (data.text ?? '').trim()
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.terminate().catch(() => { /* noop */ })
      this.worker = null
    }
  }
}
