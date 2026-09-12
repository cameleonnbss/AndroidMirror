import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useApp } from '../store'
import { Button, useToast } from '../components/ui'
import type { LogEntry } from '@renderer/renderer-types'

const FILTERS = ['all', 'info', 'success', 'warn', 'error', 'cmd'] as const

export function LogsPage(): JSX.Element {
  const { logs, clearLogs } = useApp()
  const toast = useToast()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const boxRef = useRef<HTMLDivElement>(null)

  const shown = logs.filter((l) => filter === 'all' || l.level === filter)

  useEffect(() => {
    if (autoScroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight
    }
  }, [shown.length, autoScroll])

  const time = (ts: number): string => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  }

  return (
    <div className="page">
      <h1 className="page-title">Logs</h1>
      <p className="page-sub">ADB &amp; scrcpy commands, device events, session lifecycle and errors.</p>

      <div className="row wrap" style={{ marginBottom: 12 }}>
        <Button
          className="small"
          onClick={async () => {
            const text = shown
              .map((l) => `[${time(l.ts)}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`)
              .join('\n')
            await navigator.clipboard.writeText(text)
            toast('Logs copied to clipboard', 'success')
          }}
        >
          Copy
        </Button>
        <Button
          className="small"
          onClick={async () => {
            const p = await window.api.exportLogs()
            if (p) toast(`Exported to ${p}`, 'success')
          }}
        >
          Export…
        </Button>
        <Button
          className="small danger"
          onClick={() => {
            clearLogs()
            toast('Logs cleared')
          }}
        >
          Clear
        </Button>
        <label className="check" style={{ margin: '0 0 0 12px' }}>
          <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
          auto-scroll
        </label>
        <span className="spacer" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ maxWidth: 150 }}>
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className="logs-box" ref={boxRef}>
        {shown.length === 0 ? (
          <span className="muted">No log entries for this filter.</span>
        ) : (
          shown.map((l: LogEntry) => (
            <div key={l.id} className={`log-line ${l.level}`}>
              <span className="t">{time(l.ts)}</span>{' '}
              <span className="log-source">[{l.source}]</span>{' '}
              <span className="m">{l.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
