const SOURCE_SCORE: Record<string, number> = {
  'e-GP Tender': 30,
  'Referral': 25,
  'LINE OA': 20,
  'Facebook Ads': 15,
  'Website': 10,
  'Instagram': 5,
}

export function scoreLead(input: {
  source: string
  email?: string | null
  phone?: string | null
  estValue?: number | null
  companyName?: string | null
}): number {
  let s = 0
  s += SOURCE_SCORE[input.source] ?? 10
  if (input.email && input.email.length > 0) s += 15
  if (input.phone && input.phone.length > 0) s += 15
  if (input.estValue) {
    if (input.estValue >= 5_000_000) s += 25
    else if (input.estValue >= 1_000_000) s += 20
    else if (input.estValue >= 500_000) s += 12
    else s += 5
  }
  if (input.companyName && input.companyName.length >= 10) s += 5
  return Math.max(0, Math.min(100, s))
}
