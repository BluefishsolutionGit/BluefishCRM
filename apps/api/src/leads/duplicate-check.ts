function normalize(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[\s\-()+.]/g, '').trim()
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  // Simple Jaro-like: shared trigram ratio
  const grams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i <= s.length - 3; i++) set.add(s.slice(i, i + 3))
    return set
  }
  const A = grams(a)
  const B = grams(b)
  if (A.size === 0 || B.size === 0) return 0
  let shared = 0
  A.forEach((g) => { if (B.has(g)) shared++ })
  return shared / Math.max(A.size, B.size)
}

export interface DuplicateCandidate {
  id: string
  name: string
  companyName: string
  email: string | null
  phone: string | null
  similarity: number
}

export function findDuplicates(
  input: { name: string; companyName: string; email?: string | null; phone?: string | null },
  existing: Array<{ id: string; name: string; companyName: string; email: string | null; phone: string | null }>,
): DuplicateCandidate[] {
  const iPhone = normalize(input.phone)
  const iEmail = normalize(input.email)
  const iCompany = normalize(input.companyName)
  const iName = normalize(input.name)

  const results: DuplicateCandidate[] = []
  for (const row of existing) {
    let score = 0
    if (iPhone && normalize(row.phone) === iPhone) score = Math.max(score, 1)
    if (iEmail && normalize(row.email) === iEmail) score = Math.max(score, 1)
    if (iCompany) score = Math.max(score, similarity(iCompany, normalize(row.companyName)))
    if (iName) score = Math.max(score, similarity(iName, normalize(row.name)) * 0.85)
    if (score >= 0.75) results.push({ id: row.id, name: row.name, companyName: row.companyName, email: row.email, phone: row.phone, similarity: Number(score.toFixed(2)) })
  }
  return results.sort((a, b) => b.similarity - a.similarity)
}
