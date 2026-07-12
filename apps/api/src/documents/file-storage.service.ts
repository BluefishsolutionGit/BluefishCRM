import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'

@Injectable()
export class FileStorageService {
  private readonly base: string

  constructor(cfg: ConfigService) {
    this.base = cfg.get<string>('STORAGE_DIR') ?? path.resolve(process.cwd(), 'storage')
  }

  async put(buffer: Buffer, filename: string, folder = 'documents'): Promise<{ key: string; size: number }> {
    const hash = crypto.randomBytes(6).toString('hex')
    const safeName = filename.replace(/[^\w.\-]/g, '_')
    const key = path.posix.join(folder, `${Date.now()}-${hash}-${safeName}`)
    const dest = path.join(this.base, key)
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.writeFile(dest, buffer)
    return { key, size: buffer.length }
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.base, key))
  }

  async delete(key: string): Promise<void> {
    try { await fs.unlink(path.join(this.base, key)) } catch { /* ignore */ }
  }

  absolutePath(key: string): string {
    return path.join(this.base, key)
  }
}
