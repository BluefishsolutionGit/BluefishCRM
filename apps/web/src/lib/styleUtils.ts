import type { CSSProperties } from 'react'

export function pill(bg: string, fg: string): CSSProperties {
  return {
    background: bg,
    color: fg,
    borderRadius: 7,
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 9px',
    whiteSpace: 'nowrap',
  }
}

export function av(size: number, col: string): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    background: col,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: Math.round(size * 0.36),
    fontWeight: 700,
    flex: 'none',
  }
}

const statusMap: Record<string, [string, string]> = {
  Active: ['#E4EDFC', '#2A6FDB'],
  Prospect: ['#E7EDF9', '#1F5AC2'],
  Inactive: ['#F2F3F9', '#8888A0'],
  'Pending Approval': ['#F7EBD9', '#B4650A'],
  Approved: ['#E4EDFC', '#2A6FDB'],
  Sent: ['#E7EDF9', '#1F5AC2'],
  Draft: ['#F2F3F9', '#5C5C74'],
}
export function statusStyle(s: string): CSSProperties {
  const [bg, fg] = statusMap[s] || ['#F2F3F9', '#5C5C74']
  return pill(bg, fg)
}

const srcMap: Record<string, [string, string]> = {
  'LINE OA': ['#E5F8ED', '#06A94A'],
  'e-GP Tender': ['#F4F1FD', '#4A3AB8'],
  'Facebook Ads': ['#E7F0FE', '#0070DB'],
  Website: ['#F2F3F9', '#5C5C74'],
  Referral: ['#F7EBD9', '#B4650A'],
  Instagram: ['#FCE9F2', '#D6337A'],
}
export function srcStyle(s: string): CSSProperties {
  const [bg, fg] = srcMap[s] || ['#F2F3F9', '#5C5C74']
  return pill(bg, fg)
}

const ctStatusMap: Record<string, [string, string]> = {
  Draft: ['#F2F3F9', '#5C5C74'],
  'Under Review': ['#EAE7F7', '#5B3FC4'],
  'Pending Approval': ['#F7EBD9', '#B4650A'],
  Approved: ['#E4EDFC', '#2A6FDB'],
  Signed: ['#E7EDF9', '#1F5AC2'],
  Active: ['#E5F8ED', '#06A94A'],
  Expiring: ['#FEEFE6', '#D2601A'],
  Expired: ['#FDECEA', '#C0392B'],
  Renewed: ['#F4F1FD', '#4A3AB8'],
  Terminated: ['#ECECF1', '#6B6B7B'],
}
export function ctStatusStyle(s: string): CSSProperties {
  const [bg, fg] = ctStatusMap[s] || ['#F2F3F9', '#5C5C74']
  return pill(bg, fg)
}
export function ctStatusColor(s: string): string {
  return ctStatusMap[s]?.[1] || '#5C5C74'
}

const chColorMap: Record<string, string> = {
  LINE: '#06C755',
  'LINE OA': '#06C755',
  Messenger: '#0084FF',
  Instagram: '#D6337A',
}
export function chStyle(ch: string): CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 9,
    background: chColorMap[ch] || '#5C5C74',
    color: '#fff',
    fontSize: 12,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 'none',
  }
}

export function riskStyle(r: 'Low' | 'Med' | 'High'): CSSProperties {
  const map = {
    High: ['#FDECEA', '#C0392B'],
    Med: ['#FEF3E2', '#B4650A'],
    Low: ['#EAF3EC', '#1E8A4C'],
  } as const
  const [bg, fg] = map[r]
  return pill(bg, fg)
}

const oppStatusMap: Record<string, [string, string]> = {
  Prospect: ['#F2F3F9', '#5C5C74'],
  'Contract Identified': ['#EAE7F7', '#5B3FC4'],
  Monitoring: ['#E7EDF9', '#1F5AC2'],
  'Renewal Window': ['#E5F8ED', '#0E9C7E'],
  'Proposal Submitted': ['#E4EDFC', '#2A6FDB'],
  Negotiation: ['#FEEFE6', '#D2601A'],
  Won: ['#E5F8ED', '#06A94A'],
  Lost: ['#FDECEA', '#C0392B'],
  'Auto Renewed': ['#F4F1FD', '#4A3AB8'],
}
export function oppStatusStyle(s: string): CSSProperties {
  const [bg, fg] = oppStatusMap[s] || ['#F2F3F9', '#5C5C74']
  return pill(bg, fg)
}
