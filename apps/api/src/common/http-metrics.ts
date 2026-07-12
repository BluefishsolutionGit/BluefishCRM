/**
 * Zero-dep HTTP metrics collector.
 *
 * Records request count, error count, and a latency histogram keyed by
 * (method, route-family). Exposed via /api/metrics in Prometheus text format
 * so a Grafana/Prometheus stack can scrape it without any Nest-specific glue.
 */

interface RouteStats {
  count: number
  errors: number
  totalMs: number
  histogram: number[]
}

const BUCKETS_MS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, Infinity]

const bootedAt = Date.now()
const stats = new Map<string, RouteStats>()

function keyFor(method: string, path: string): string {
  const family = path
    // UUID
    .replace(/\/[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}/gi, '/:id')
    // CUID-style: lowercase alnum, 20+ chars
    .replace(/\/[a-z0-9]{20,}(?=$|\/)/g, '/:id')
    // numeric id
    .replace(/\/\d+(?=$|\/)/g, '/:id')
  return `${method} ${family}`
}

function bucketIndex(ms: number): number {
  for (let i = 0; i < BUCKETS_MS.length; i++) if (ms <= BUCKETS_MS[i]) return i
  return BUCKETS_MS.length - 1
}

export const httpMetrics = {
  record(method: string, path: string, status: number, ms: number): void {
    const key = keyFor(method, path)
    let s = stats.get(key)
    if (!s) {
      s = { count: 0, errors: 0, totalMs: 0, histogram: new Array(BUCKETS_MS.length).fill(0) }
      stats.set(key, s)
    }
    s.count++
    if (status >= 500) s.errors++
    s.totalMs += ms
    s.histogram[bucketIndex(ms)]++
  },

  uptimeSeconds(): number {
    return Math.floor((Date.now() - bootedAt) / 1000)
  },

  snapshot(): { key: string; stats: RouteStats }[] {
    return Array.from(stats.entries()).map(([key, s]) => ({ key, stats: s }))
  },

  prometheusText(): string {
    const lines: string[] = []
    lines.push('# HELP bluefish_uptime_seconds Process uptime in seconds')
    lines.push('# TYPE bluefish_uptime_seconds counter')
    lines.push(`bluefish_uptime_seconds ${this.uptimeSeconds()}`)

    lines.push('# HELP bluefish_http_requests_total Total HTTP requests by method + route family')
    lines.push('# TYPE bluefish_http_requests_total counter')
    lines.push('# HELP bluefish_http_errors_total 5xx responses by method + route family')
    lines.push('# TYPE bluefish_http_errors_total counter')
    lines.push('# HELP bluefish_http_duration_seconds HTTP response latency histogram')
    lines.push('# TYPE bluefish_http_duration_seconds histogram')

    for (const [key, s] of stats) {
      const [method, route] = key.split(' ', 2)
      const labels = `method="${method}",route="${route.replace(/"/g, '\\"')}"`
      lines.push(`bluefish_http_requests_total{${labels}} ${s.count}`)
      lines.push(`bluefish_http_errors_total{${labels}} ${s.errors}`)
      let cumulative = 0
      for (let i = 0; i < BUCKETS_MS.length; i++) {
        cumulative += s.histogram[i]
        const le = BUCKETS_MS[i] === Infinity ? '+Inf' : (BUCKETS_MS[i] / 1000).toString()
        lines.push(`bluefish_http_duration_seconds_bucket{${labels},le="${le}"} ${cumulative}`)
      }
      lines.push(`bluefish_http_duration_seconds_sum{${labels}} ${(s.totalMs / 1000).toFixed(4)}`)
      lines.push(`bluefish_http_duration_seconds_count{${labels}} ${s.count}`)
    }
    return lines.join('\n') + '\n'
  },
}
