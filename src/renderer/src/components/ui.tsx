import React, { createContext, useCallback, useContext, useRef, useState } from 'react'

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  const { className = '', ...rest } = props
  return <button className={`btn ${className}`} {...rest} />
}

export function Field(props: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="field">
      <span className="lab">{props.label}</span>
      {props.children}
    </label>
  )
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select {...props} />
}

export function Check(props: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.label}
    </label>
  )
}

export function Badge(props: {
  color: 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'purple'
  children: React.ReactNode
  pulse?: boolean
}): React.JSX.Element {
  return (
    <span className={`badge ${props.color}`}>
      {props.pulse ? <span className="dot pulse" style={{ background: 'currentColor' }} /> : <span className="dot" style={{ background: 'currentColor' }} />}
      {props.children}
    </span>
  )
}

export function Stat(props: { k: string; v: string }): React.JSX.Element {
  return (
    <div className="stat">
      <span className="k">{props.k}</span>
      <span className="v">{props.v || '—'}</span>
    </div>
  )
}

export function SectionCard(props: {
  title: string
  children: React.ReactNode
  right?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="card">
      <h3>
        {props.title}
        {props.right ? <span className="spacer" /> : null}
        {props.right}
      </h3>
      {props.children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

interface Toast {
  id: number
  text: string
  kind: 'info' | 'success' | 'error'
}

const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {})

export function useToast(): (text: string, kind?: Toast['kind']) => void {
  return useContext(ToastCtx)
}

export function ToastHost(props: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {props.children}
      <div className="toast-host">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function Banner(props: {
  kind: 'info' | 'warn' | 'error'
  children: React.ReactNode
}): React.JSX.Element {
  return <div className={`banner ${props.kind}`}>{props.children}</div>
}

export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}
