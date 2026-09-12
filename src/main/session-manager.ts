import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type {
  MirrorSettings,
  RecordingSettings,
  RunningSession,
  SessionInfo,
  SessionKind
} from '@shared/types'
import { buildScrcpyArgs } from './scrcpy-args'
import type { RuntimePaths } from './paths'
import type { SettingsStore } from './store'
import type { DeviceWatcher } from './device-watcher'
import { logger } from './logger'

interface SessionRecord {
  info: SessionInfo
  child: ChildProcess
  startedAt: number
  recordingBase: string | null
}

export class SessionManager {
  private paths: RuntimePaths
  private store: SettingsStore
  private watcher: DeviceWatcher
  private sessions = new Map<string, SessionRecord>()
  private sessionListeners = new Set<(sessions: RunningSession[]) => void>()
  private ticker: NodeJS.Timeout | null = null
  private nextId = 1

  constructor(paths: RuntimePaths, store: SettingsStore, watcher: DeviceWatcher) {
    this.paths = paths
    this.store = store
    this.watcher = watcher
  }

  onSessions(listener: (sessions: RunningSession[]) => void): () => void {
    this.sessionListeners.add(listener)
    return () => this.sessionListeners.delete(listener)
  }

  list(): RunningSession[] {
    const now = Date.now()
    return [...this.sessions.values()].map((s) => ({
      info: s.info,
      elapsed: Math.floor((now - s.startedAt) / 1000)
    }))
  }

  private emit(): void {
    const list = this.list()
    for (const l of this.sessionListeners) {
      try {
        l(list)
      } catch {
        // ignore
      }
    }
  }

  private startTicker(): void {
    if (this.ticker) return
    this.ticker = setInterval(() => this.emit(), 1000)
  }

  private stopTickerIfIdle(): void {
    if (this.sessions.size === 0 && this.ticker) {
      clearInterval(this.ticker)
      this.ticker = null
    }
  }

  private deviceName(serial: string): string {
    const snap = this.watcher.getSnapshot()
    const d = snap.devices.find((x) => x.serial === serial)
    if (!d) return serial
    const brand = d.brand || d.manufacturer || ''
    const model = d.model || serial
    return brand && !model.toLowerCase().startsWith(brand.toLowerCase())
      ? `${brand} ${model}`
      : model
  }

  private recordingBase(recording: RecordingSettings): string {
    const dir = recording.directory || this.paths.defaultRecordingsDir
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, '-')
      .replace(/\..+/, '')
    const name = recording.fixTimestampedName
      ? `AndroidMirror_${stamp}`
      : 'AndroidMirror_recording'
    return path.join(dir, name)
  }

  async start(
    kind: SessionKind,
    serial: string,
    mirrorOverride?: Partial<MirrorSettings> | null,
    recordingOverride?: Partial<RecordingSettings> | null
  ): Promise<{ ok: boolean; message: string; sessionId?: string; recordingPath?: string }> {
    if (!['mirror', 'audio-only', 'recording', 'stream-input'].includes(kind)) {
      return { ok: false, message: 'Unknown session kind' }
    }

    // Validate that the device is currently connected and authorized.
    const snap = this.watcher.getSnapshot()
    const dev = snap.devices.find((d) => d.serial === serial)
    if (!dev) {
      return { ok: false, message: `Device ${serial} is not connected. Refresh the devices page.` }
    }
    if (dev.state !== 'device') {
      return {
        ok: false,
        message:
          dev.state === 'unauthorized'
            ? 'Device detected but ADB authorization missing. Unlock the phone and accept "Allow USB debugging".'
            : `Device state is "${dev.state}" — cannot start a session.`
      }
    }
    if (kind === 'recording') {
      const dup = [...this.sessions.values()].find(
        (s) => s.info.serial === serial && s.info.kind === 'recording'
      )
      if (dup) {
        return { ok: false, message: 'A recording session is already running for this device.' }
      }
    }

    const settings = this.store.global
    const mirror: MirrorSettings =
      mirrorOverride && Object.keys(mirrorOverride).length > 0
        ? { ...settings.mirror, ...mirrorOverride }
        : settings.mirror
    const recording: RecordingSettings =
      recordingOverride && Object.keys(recordingOverride).length > 0
        ? { ...settings.recording, ...recordingOverride }
        : settings.recording
    const advanced = settings.advanced

    const recBase = kind === 'recording' ? this.recordingBase(recording) : null
    const fmt = recording.format
    const recPath = recBase ? `${recBase}.${fmt}` : null

    const args = buildScrcpyArgs(kind, serial, mirror, recording, advanced, recBase ?? '')
    if (kind === 'recording') {
      // Headless recorder: no window, no input injection, silent playback.
      args.push('--no-window', '--no-control', '--no-audio-playback')
    }
    if (kind === 'audio-only') {
      args.push('--no-control')
    }
    if (kind === 'stream-input') {
      // Feed for OBS: no local input injection into the phone while streaming.
      args.push('--no-control')
    }

    logger.cmd('scrcpy', `scrcpy ${args.join(' ')}`)

    const sessionId = `session-${this.nextId++}-${Date.now()}`
    let child: ChildProcess
    try {
      child = spawn(this.paths.scrcpyExe, args, {
        windowsHide: true,
        env: {
          ...process.env,
          ADB: this.paths.adbExe,
          SCRCPY_SERVER_PATH: this.paths.scrcpyServer
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('scrcpy', `Failed to launch scrcpy: ${msg}`)
      return { ok: false, message: `Failed to launch scrcpy: ${msg}` }
    }

    const info: SessionInfo = {
      sessionId,
      serial,
      deviceName: this.deviceName(serial),
      kind,
      startedAt: Date.now(),
      args,
      recordingPath: recPath
    }
    const record: SessionRecord = {
      info,
      child,
      startedAt: Date.now(),
      recordingBase: recBase
    }
    this.sessions.set(sessionId, record)
    this.emit()
    this.startTicker()
    logger.success(
      'session',
      `${kindLabel(kind)} started on ${info.deviceName} (${serial})`
    )

    const tag = `scrcpy:${serial}`
    const forward = (buf: Buffer) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        const t = line.trim()
        if (!t) continue
        if (/ERROR/i.test(t)) logger.error(tag, t)
        else if (/WARN/i.test(t)) logger.warn(tag, t)
        else logger.info(tag, t)
      }
    }
    child.stdout?.on('data', forward)
    child.stderr?.on('data', forward)

    child.on('error', (err) => {
      logger.error(tag, `scrcpy process error: ${err.message}`)
    })

    child.on('close', (code, signal) => {
      const wasKnown = this.sessions.delete(sessionId)
      if (!wasKnown) return
      this.emit()
      this.stopTickerIfIdle()
      const ended = kindLabel(kind)
      if (code === 0) {
        logger.success(tag, `${ended} ended normally`)
      } else if (code === 2) {
        logger.warn(tag, `${ended} stopped: device disconnected (exit 2)`)
      } else if (signal) {
        logger.info(tag, `${ended} stopped by user (signal ${signal})`)
      } else {
        logger.error(tag, `${ended} failed with exit code ${code}`)
      }
      if (record.recordingBase) {
        const file = `${record.recordingBase}.${fmt}`
        try {
          if (fs.existsSync(file)) {
            const size = fs.statSync(file).size
            this.store.pushRecentRecording(file)
            logger.success(
              'recording',
              `Saved ${path.basename(file)} (${(size / (1024 * 1024)).toFixed(1)} MB)`
            )
          } else {
            logger.warn('recording', `Recording file not found after exit: ${file}`)
          }
        } catch {
          // ignore fs errors
        }
      }
    })

    return { ok: true, message: `${kindLabel(kind)} started`, sessionId, recordingPath: recPath ?? undefined }
  }

  stop(sessionId: string): { ok: boolean; message: string } {
    const rec = this.sessions.get(sessionId)
    if (!rec) return { ok: false, message: 'Session not found' }
    try {
      rec.child.kill()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('session', `Failed to stop ${sessionId}: ${msg}`)
      return { ok: false, message: msg }
    }
    return { ok: true, message: 'Stopping…' }
  }

  stopAll(): number {
    let n = 0
    for (const rec of this.sessions.values()) {
      try {
        rec.child.kill()
        n++
      } catch {
        // ignore
      }
    }
    return n
  }

  shutdown(): void {
    this.stopAll()
  }
}

function kindLabel(kind: SessionKind): string {
  switch (kind) {
    case 'mirror':
      return 'Mirror'
    case 'audio-only':
      return 'Audio-only'
    case 'recording':
      return 'Recording'
    case 'stream-input':
      return 'Stream input'
  }
}
