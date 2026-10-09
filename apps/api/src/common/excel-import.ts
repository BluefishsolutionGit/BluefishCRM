import type * as ExcelJS from 'exceljs'

// Template headers mark required columns with a trailing "*"; strip it when reading
// back so files from either the old or new template still match.
export const templateHeader = (c: { header: string; required?: boolean }) => (c.required ? `${c.header} *` : c.header)
export const normalizeHeader = (text: string) => text.replace(/\s*\*\s*$/, '').trim().toLowerCase()

// Excel auto-converts emails/URLs to hyperlinks and may store rich text or formulas, so
// cell.value can be an object — String() on it yields "[object Object]".
export const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v !== 'object') return String(v).trim()
  if ('richText' in v) return v.richText.map((t) => t.text).join('').trim()
  if ('hyperlink' in v) return cellText(v.text as ExcelJS.CellValue).replace(/^mailto:/i, '')
  if ('result' in v) return cellText(v.result as ExcelJS.CellValue)
  return ''
}
