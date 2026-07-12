import type { PrismaService } from '../prisma/prisma.service'

export async function nextQuotationNo(prisma: PrismaService): Promise<string> {
  const year = new Date().getUTCFullYear()
  const prefix = `QT-${year}-`
  const latest = await prisma.quotation.findFirst({
    where: { no: { startsWith: prefix } },
    orderBy: { no: 'desc' },
    select: { no: true },
  })
  const nextSeq = latest ? Number(latest.no.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}
