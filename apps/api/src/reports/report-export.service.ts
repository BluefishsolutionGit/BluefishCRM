import { Injectable } from '@nestjs/common'
import * as ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, HeadingLevel, WidthType } from 'docx'
import type { ReportDefinitionDto, ReportFormat, ReportResultDto } from '@bluefish/shared'
import { ReportsService } from './reports.service'

@Injectable()
export class ReportExportService {
  constructor(private reports: ReportsService) {}

  async export(format: ReportFormat, result: ReportResultDto): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const def = this.reports.findDef(result.key)
    const stamp = result.generatedAt.slice(0, 10)
    const base = `${result.key}-${stamp}`
    switch (format) {
      case 'xlsx': return { buffer: await this.toExcel(def, result), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${base}.xlsx` }
      case 'pdf': return { buffer: await this.toPdf(def, result), contentType: 'application/pdf', filename: `${base}.pdf` }
      case 'docx': return { buffer: await this.toDocx(def, result), contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: `${base}.docx` }
    }
  }

  private async toExcel(def: ReportDefinitionDto, result: ReportResultDto): Promise<Buffer> {
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet(def.name.slice(0, 30))
    sheet.columns = def.columns.map((c) => ({ header: c.label, key: c.key, width: 22 }))
    sheet.getRow(1).font = { bold: true }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FC' } }
    for (const row of result.rows) {
      sheet.addRow(row.values)
    }
    for (let i = 0; i < def.columns.length; i++) {
      const col = def.columns[i]
      if (col.type === 'currency') {
        sheet.getColumn(i + 1).numFmt = '"฿"#,##0'
      } else if (col.type === 'number') {
        sheet.getColumn(i + 1).numFmt = '#,##0'
      }
    }
    if (result.totals) {
      sheet.addRow({})
      const totalsRow = sheet.addRow({ [def.columns[0].key]: 'TOTALS' })
      totalsRow.font = { bold: true }
      const [firstKey] = Object.keys(result.totals)
      if (firstKey) totalsRow.getCell(2).value = `${firstKey}=${result.totals[firstKey]}`
    }
    const buf = await wb.xlsx.writeBuffer()
    return Buffer.from(buf as ArrayBuffer)
  }

  private async toPdf(def: ReportDefinitionDto, result: ReportResultDto): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

    doc.fontSize(18).fillColor('#2E1A6B').text(def.name)
    doc.fontSize(9).fillColor('#8888A0').text(`Generated ${result.generatedAt.slice(0, 19).replace('T', ' ')} · ${result.rows.length} rows`)
    doc.moveDown(0.5)

    const colWidths = def.columns.map((c) => {
      if (c.type === 'currency' || c.type === 'number') return 80
      if (c.type === 'date') return 78
      return 120
    })
    const totalWidth = colWidths.reduce((a, w) => a + w, 0)
    const scale = Math.min(1, 760 / totalWidth)
    const w = colWidths.map((cw) => Math.floor(cw * scale))
    let x = 40
    const startY = doc.y
    doc.fontSize(9).fillColor('#5C5C74')
    def.columns.forEach((c, i) => { doc.text(c.label, x, startY, { width: w[i] }); x += w[i] })
    doc.moveTo(40, doc.y + 4).lineTo(40 + w.reduce((a, wi) => a + wi, 0), doc.y + 4).stroke('#E5E7F0')
    let y = doc.y + 8

    for (const row of result.rows) {
      if (y > 550) { doc.addPage({ size: 'A4', layout: 'landscape' }); y = 50 }
      x = 40
      def.columns.forEach((c, i) => {
        const raw = row.values[c.key]
        const s = c.type === 'currency' && typeof raw === 'number' ? '฿' + raw.toLocaleString('en-US')
          : c.type === 'number' && typeof raw === 'number' ? raw.toLocaleString('en-US')
          : String(raw ?? '')
        doc.fontSize(9).fillColor('#3B3B52').text(s, x, y, { width: w[i], ellipsis: true })
        x += w[i]
      })
      y += 16
    }

    if (result.totals) {
      y += 8
      doc.fontSize(10).fillColor('#1E1E30').text('Totals', 40, y)
      y += 14
      for (const [k, v] of Object.entries(result.totals)) {
        doc.fontSize(9).fillColor('#5C5C74').text(`${k}: ${typeof v === 'number' ? v.toLocaleString('en-US') : v}`, 40, y)
        y += 12
      }
    }

    doc.end()
    return done
  }

  private async toDocx(def: ReportDefinitionDto, result: ReportResultDto): Promise<Buffer> {
    const headerRow = new TableRow({
      children: def.columns.map((c) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: c.label, bold: true })] })],
      })),
    })
    const dataRows = result.rows.map((row) =>
      new TableRow({
        children: def.columns.map((c) => {
          const raw = row.values[c.key]
          const text = c.type === 'currency' && typeof raw === 'number' ? '฿' + raw.toLocaleString('en-US')
            : c.type === 'number' && typeof raw === 'number' ? raw.toLocaleString('en-US')
            : String(raw ?? '')
          return new TableCell({ children: [new Paragraph(text)] })
        }),
      })
    )
    const doc = new Document({
      creator: 'Bluefish CRM',
      title: def.name,
      sections: [{
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(def.name)] }),
          new Paragraph({ children: [new TextRun({ text: `Generated ${result.generatedAt.slice(0, 19).replace('T', ' ')} · ${result.rows.length} rows`, italics: true })] }),
          new Paragraph({ children: [new TextRun('')] }),
          new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } }),
        ],
      }],
    })
    return Packer.toBuffer(doc)
  }
}
