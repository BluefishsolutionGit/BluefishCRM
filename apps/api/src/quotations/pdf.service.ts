import { Injectable, NotFoundException } from '@nestjs/common'
import PDFDocument from 'pdfkit'
import { QuotationsService } from './quotations.service'

const THB = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

@Injectable()
export class PdfService {
  constructor(private quotations: QuotationsService) {}

  async renderQuotation(id: string): Promise<Buffer> {
    const q = await this.quotations.currentVersionWithLines(id)
    if (!q.currentVersion) throw new NotFoundException('Quotation has no version yet')

    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

    // Header
    doc.fontSize(20).fillColor('#2E1A6B').text('Bluefish CRM', 50, 50).font('Helvetica')
    doc.fontSize(9).fillColor('#5C5C74').text('Quotation', 50, 74)

    doc.fontSize(14).fillColor('#1E1E30').text(q.no, 400, 50, { align: 'right' })
    doc.fontSize(9).fillColor('#5C5C74').text(`Version ${q.currentVersion.versionNo} · ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, 400, 68, { align: 'right' })
    doc.fontSize(9).fillColor(statusColor(q.status)).text(`STATUS: ${q.status.toUpperCase()}`, 400, 82, { align: 'right' })

    doc.moveTo(50, 105).lineTo(545, 105).strokeColor('#E5E7F0').stroke()

    // Customer block
    doc.fontSize(9).fillColor('#8888A0').text('BILL TO', 50, 120)
    doc.fontSize(11).fillColor('#1E1E30').text(q.customer.name, 50, 134)
    doc.fontSize(9).fillColor('#5C5C74')
      .text(q.customer.address, 50, 150, { width: 240 })
      .text(`Tax ID: ${q.customer.taxId}`, 50, 180)

    doc.fontSize(9).fillColor('#8888A0').text('PREPARED BY', 320, 120)
    doc.fontSize(11).fillColor('#1E1E30').text(q.owner.name, 320, 134)
    doc.fontSize(9).fillColor('#5C5C74').text(q.owner.email, 320, 150)

    // Line items
    let y = 220
    doc.fontSize(9).fillColor('#8888A0')
      .text('#', 50, y).text('ITEM', 80, y).text('QTY', 320, y, { width: 40, align: 'right' })
      .text('UNIT', 370, y, { width: 70, align: 'right' })
      .text('AMOUNT', 460, y, { width: 85, align: 'right' })
    y += 14
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#E5E7F0').stroke()
    y += 6

    for (const [i, line] of q.currentVersion.lines.entries()) {
      doc.fontSize(10).fillColor('#5C5C74').text(String(i + 1), 50, y)
      doc.fontSize(10).fillColor('#1E1E30').text(line.itemName, 80, y, { width: 230 })
      if (line.description) {
        doc.fontSize(8).fillColor('#8888A0').text(line.description, 80, y + 12, { width: 230 })
      }
      doc.fontSize(10).fillColor('#1E1E30')
        .text(String(line.quantity), 320, y, { width: 40, align: 'right' })
        .text(THB.format(line.unitPrice), 370, y, { width: 70, align: 'right' })
        .text(THB.format(line.amount), 460, y, { width: 85, align: 'right' })
      y += (line.description ? 32 : 22)
      if (y > 720) { doc.addPage(); y = 60 }
    }

    // Totals
    y += 10
    doc.moveTo(310, y).lineTo(545, y).strokeColor('#E5E7F0').stroke()
    y += 8
    const cv = q.currentVersion
    doc.fontSize(10).fillColor('#5C5C74')
      .text('Subtotal', 310, y).text(THB.format(cv.subtotal), 460, y, { width: 85, align: 'right' })
    y += 16
    if (cv.discountPct > 0) {
      doc.fillColor('#C0392B')
        .text(`Discount ${cv.discountPct}%`, 310, y)
        .text(`−${THB.format(cv.discountAmt)}`, 460, y, { width: 85, align: 'right' })
      y += 16
    }
    doc.fillColor('#5C5C74')
      .text(`VAT ${cv.vatPct}%`, 310, y)
      .text(THB.format(cv.vatAmt), 460, y, { width: 85, align: 'right' })
    y += 20
    doc.moveTo(310, y).lineTo(545, y).strokeColor('#1E1E30').stroke()
    y += 8
    doc.fontSize(13).fillColor('#1E1E30').text('Grand total', 310, y)
      .text(`฿ ${THB.format(cv.grandTotal)}`, 400, y, { width: 145, align: 'right' })
    y += 30

    // Terms
    doc.fontSize(9).fillColor('#8888A0').text('TERMS', 50, y); y += 12
    doc.fontSize(9).fillColor('#3B3B52').text(cv.terms, 50, y, { width: 500 })

    if (cv.notes) {
      y += 30
      doc.fontSize(9).fillColor('#8888A0').text('NOTES', 50, y); y += 12
      doc.fontSize(9).fillColor('#3B3B52').text(cv.notes, 50, y, { width: 500 })
    }

    doc.end()
    return done
  }
}

function statusColor(status: string): string {
  if (status === 'Approved' || status === 'Sent') return '#0E9C7E'
  if (status === 'Rejected') return '#C0392B'
  if (status === 'Pending Approval') return '#B4650A'
  return '#5C5C74'
}
