import fs from 'node:fs'
import path from 'node:path'
import type { LogEntry } from '@shared/types'

type Listener = (entry: LogEntry) => void

const MAX_MEMORY_ENTRIES = 2000
const MAX_LOG_FILES = 10

export class Logger {
  private entries: LogEntry[] = []
  private listeners = new Set<Listener>()
  private nextId = 1
  private stream: fs.WriteStream | null = null
  private filePath = ''

  init(logsDir: string): void {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    this.filePath = path.join(logsDir, `androidmirror-${stamp}.log`)
    try {
      this.stream = fs.createWriteStream(this.filePath, { flags: 'a' })
      this.stream.write(`--- AndroidMirror session started ${new Date().toISOString()} ---\n`)
      this.pruneOldLogs(logsDir)
    } catch {
      // Logging must never crash the app.
      this.stream = null
    }
  }

  getLogFilePath(): string {
    return this.filePath
  }

  getEntries(): LogEntry[] {
    return this.entries
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear(): void {
    this.entries = []
    this.emit(
      {
        id: this.nextId++,
        ts: Date.now(),
        level: 'info',
        source: 'app',
        message: 'Logs cleared'
      },
      { persist: false }
    )
  }

  log(level: LogEntry['level'], source: string, message: string): void {
    const entry: LogEntry = { id: this.nextId++, ts: Date.now(), level, source, message }
    this.emit(entry, { persist: true })
  }

  info(source: string, message: string): void {
    this.log('info', source, message)
  }
  warn(source: string, message: string): void {
    this.log('warn', source, message)
  }
  error(source: string, message: string): void {
    this.log('error', source, message)
  }
  success(source: string, message: string): void {
    this.log('success', source, message)
  }
  cmd(source: string, message: string): void {
    this.log('cmd', source, message)
  }

  private emit(entry: LogEntry, opts: { persist: boolean }): void {
    this.entries.push(entry)
    if (this.entries.length > MAX_MEMORY_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_MEMORY_ENTRIES)
    }
    for (const l of this.listeners) {
      try {
        l(entry)
      } catch {
        // ignore listener errors
      }
    }
    if (opts.persist && this.stream) {
      const time = new Date(entry.ts).toLocaleTimeString('en-GB')
      const line = `[${time}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}\n`
      try {
        this.stream.write(line)
      } catch {
        // ignore
      }
    }
  }

  private pruneOldLogs(logsDir: string): void {
    try {
      const files = fs
        .readdirSync(logsDir)
        .filter((f) => f.endsWith('.log'))
        .map((f) => ({ f, m: fs.statSync(path.join(logsDir, f)).mtimeMs }))
        .sort((a, b) => b.m - a.m)
      for (const old of files.slice(MAX_LOG_FILES)) {
        fs.rmSync(path.join(logsDir, old.f), { force: true })
      }
    } catch {
      // ignore
    }
  }
}

export const logger = new Logger()
