export interface RiskFinding {
  severity: 'low' | 'medium' | 'high'
  category: string
  message: string
  snippet: string | null
}

const RULES: Array<{ pattern: RegExp; severity: RiskFinding['severity']; category: string; message: string }> = [
  { pattern: /unlimited liability|unlimited\s+damages/i, severity: 'high', category: 'liability', message: 'Unlimited liability language — cap or exclude specific damages.' },
  { pattern: /indemnif(y|ication)/i, severity: 'medium', category: 'liability', message: 'Indemnification clause — review scope and cap.' },
  { pattern: /perpetual|in\s+perpetuity/i, severity: 'medium', category: 'unusual_clause', message: 'Perpetual term — confirm intent; add renewal or termination triggers.' },
  { pattern: /(auto[-\s]?renew|automatic(ally)?\s+renew)/i, severity: 'low', category: 'renewal', message: 'Auto-renewal detected — ensure notification lead time is defined.' },
  { pattern: /liquidated damages|penalty of/i, severity: 'medium', category: 'penalty', message: 'Liquidated damages / penalty clause — verify caps and triggers.' },
  { pattern: /governing law:\s*(?!thailand)/i, severity: 'medium', category: 'jurisdiction', message: 'Governing law is not Thailand — confirm this is intentional.' },
  { pattern: /pay(ment)?\s+(within)?\s*(60|90|120)\s+days/i, severity: 'medium', category: 'payment_term', message: 'Long payment terms (>= 60 days) — confirm cash-flow impact.' },
  { pattern: /exclusiv(e|ity)/i, severity: 'medium', category: 'unusual_clause', message: 'Exclusivity clause — ensure it aligns with commercial strategy.' },
]

// Clauses that SHOULD be present in most contracts
const REQUIRED = [
  { pattern: /confidentialit(y|é)/i, category: 'missing_clause', message: 'No confidentiality clause detected.' },
  { pattern: /limitation of liability/i, category: 'missing_clause', message: 'No limitation-of-liability clause detected.' },
  { pattern: /governing law/i, category: 'missing_clause', message: 'No governing-law clause detected.' },
  { pattern: /termination|terminate/i, category: 'missing_clause', message: 'No termination clause detected.' },
]

export function analyzeContractText(body: string): RiskFinding[] {
  const findings: RiskFinding[] = []
  for (const r of RULES) {
    const m = body.match(r.pattern)
    if (m) findings.push({ severity: r.severity, category: r.category, message: r.message, snippet: contextAround(body, m.index ?? 0, m[0].length) })
  }
  for (const r of REQUIRED) {
    if (!r.pattern.test(body)) findings.push({ severity: 'medium', category: r.category, message: r.message, snippet: null })
  }
  return findings
}

export function overallRisk(findings: RiskFinding[]): 'Low' | 'Med' | 'High' {
  if (findings.some((f) => f.severity === 'high')) return 'High'
  if (findings.filter((f) => f.severity === 'medium').length >= 2) return 'High'
  if (findings.some((f) => f.severity === 'medium')) return 'Med'
  return 'Low'
}

function contextAround(body: string, at: number, len: number, radius = 60): string {
  const from = Math.max(0, at - radius)
  const to = Math.min(body.length, at + len + radius)
  return body.slice(from, to).replace(/\s+/g, ' ').trim()
}
