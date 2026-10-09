import type { ImportResultDto } from '@bluefish/shared'

/** One sheet's import outcome — counts plus a scrollable table of row errors. */
export default function ImportResultSection({ title, sheet, imported, skipped, errors }: {
  title: string
  sheet?: string
  imported: number
  skipped: number
  errors: ImportResultDto['errors']
}) {
  return (
    <div style={{ background: '#F7F8FC', borderRadius: 10, padding: '12px 14px', fontSize: 13, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        {sheet && <div style={{ fontSize: 11.5, color: '#8888A0' }}>sheet “{sheet}”</div>}
      </div>
      <div>
        <b style={{ color: '#1E8E5A' }}>Imported:</b> {imported} · <b style={{ color: skipped > 0 ? '#C0392B' : undefined }}>Skipped:</b> {skipped}
      </div>
      {errors.length > 0 && (
        <div style={{ marginTop: 10, maxHeight: 160, overflow: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#8888A0' }}>
                <th style={{ textAlign: 'left', padding: 4 }}>Row</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Field</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i} style={{ borderTop: '1px solid #E5E7F0' }}>
                  <td style={{ padding: 4 }}>{e.row}</td>
                  <td style={{ padding: 4 }}>{e.field ?? '—'}</td>
                  <td style={{ padding: 4, color: '#C0392B' }}>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
