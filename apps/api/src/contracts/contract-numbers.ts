import type { PrismaService } from '../prisma/prisma.service'

export async function nextContractNo(prisma: PrismaService): Promise<string> {
  const year = new Date().getUTCFullYear()
  const prefix = `CT-${year}-`
  const latest = await prisma.contract.findFirst({
    where: { no: { startsWith: prefix } },
    orderBy: { no: 'desc' },
    select: { no: true },
  })
  const seq = latest ? Number(latest.no.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}
