import { describe, expect, it } from 'vitest'
import { httpMetrics } from './http-metrics'

describe('httpMetrics', () => {
  it('groups requests by (method, route family) with :id normalization', () => {
    httpMetrics.record('GET', '/api/customers/cmrghah48000r7irsxbbw7uvh', 200, 12)
    httpMetrics.record('GET', '/api/customers/cmrhtf47x002r1u4rlyryr89o', 200, 18)
    const text = httpMetrics.prometheusText()
    expect(text).toMatch(/bluefish_http_requests_total\{method="GET",route="\/api\/customers\/:id"\} 2/)
  })

  it('counts 5xx as errors', () => {
    httpMetrics.record('POST', '/api/leads', 500, 30)
    const text = httpMetrics.prometheusText()
    expect(text).toMatch(/bluefish_http_errors_total\{method="POST",route="\/api\/leads"\} \d+/)
  })

  it('places latency into the correct histogram bucket', () => {
    httpMetrics.record('GET', '/api/test-bucket', 200, 150)
    const text = httpMetrics.prometheusText()
    // 150ms falls in the 200ms bucket (le="0.2")
    expect(text).toMatch(/route="\/api\/test-bucket",le="0.2"\} 1/)
  })
})
