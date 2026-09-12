import { spawn, execFile } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { ConnectionKind, DeviceInfo } from '@shared/types'
import type { RuntimePaths } from './paths'
import { logger } from './logger'

const ADB_TIMEOUT_MS = 8000

export class AdbError extends Error {}

function runExe(
  exe: string,
  args: string[],
  timeoutMs = ADB_TIMEOUT_MS
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    let child: ChildProcess
    try {
      child = spawn(exe, args, { windowsHide: true })
    } catch (err) {
      reject(new AdbError(`Failed to spawn ${exe}: ${String(err)}`))
      return
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill()
        reject(new AdbError(`Command timed out after ${timeoutMs}ms: adb ${args.join(' ')}`))
      }
    }, timeoutMs)

    child.stdout?.on('data', (d) => (stdout += String(d)))
    child.stderr?.on('data', (d) => (stderr += String(d)))
    child.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new AdbError(`adb failed to start: ${err.message}`))
      }
    })
    child.on('close', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ code: code ?? -1, stdout, stderr })
      }
    })
  })
}

/** Parses `adb devices -l` output into structured rows. */
export function parseAdbDevices(output: string): Array<{ serial: string; state: string; model: string; device: string }> {
  const lines = output.split(/\r?\n/).slice(1) // skip header
  const rows: Array<{ serial: string; state: string; model: string; device: string }> = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) continue
    const serial = parts[0]
    const state = parts[1]
    let model = ''
    let device = ''
    for (const part of parts.slice(2)) {
      if (part.startsWith('model:')) model = part.slice(6)
      if (part.startsWith('device:')) device = part.slice(7)
    }
    rows.push({ serial, state, model, device })
  }
  return rows
}

export class AdbService {
  private paths: RuntimePaths
  private _version: string | null = null
  private _ready = false

  constructor(paths: RuntimePaths) {
    this.paths = paths
  }

  get adbExe(): string {
    return this.paths.adbExe
  }

  get ready(): boolean {
    return this._ready
  }

  get version(): string | null {
    return this._version
  }

  async check(): Promise<boolean> {
    try {
      const res = await runExe(this.paths.adbExe, ['version'], 5000)
      if (res.code === 0) {
        const m = res.stdout.match(/Android Debug Bridge version ([\d.]+)/)
        this._version = m ? m[1] : 'unknown'
        this._ready = true
        return true
      }
      this._ready = false
      return false
    } catch (err) {
      this._ready = false
      logger.error('adb', `ADB not available: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }

  async raw(args: string[], timeoutMs?: number): Promise<string> {
    const res = await runExe(this.paths.adbExe, args, timeoutMs)
    if (res.code !== 0) {
      const msg = (res.stderr || res.stdout || `exit code ${res.code}`).trim()
      throw new AdbError(msg)
    }
    return res.stdout
  }

  /** Best-effort shell command; returns stdout or throws with a readable message. */
  async shell(serial: string, command: string, timeoutMs?: number): Promise<string> {
    return this.raw(['-s', serial, 'shell', command], timeoutMs)
  }

  async listDevices(): Promise<DeviceInfo[]> {
    const out = await this.raw(['devices', '-l'])
    const rows = parseAdbDevices(out)
    const devices: DeviceInfo[] = []
    for (const row of rows) {
      devices.push(this.buildDeviceInfo(row.serial, row.state, row.model))
    }
    return devices
  }

  private buildDeviceInfo(serial: string, state: string, model: string): DeviceInfo {
    const kind: ConnectionKind = serial.includes(':')
      ? 'wifi'
      : serial.startsWith('emulator-')
        ? 'emulator'
        : 'usb'
    const info: DeviceInfo = {
      serial,
      kind,
      state: (state as DeviceInfo['state']) ?? 'unknown',
      model: model || '',
      brand: '',
      manufacturer: '',
      androidVersion: '',
      apiLevel: '',
      resolution: '',
      refreshRate: '',
      batteryLevel: '',
      batteryTemp: '',
      batteryHealth: '',
      storageUsed: '',
      storageTotal: '',
      storagePercent: null
    }
    return info
  }

  /** Enriches a device with properties. Never throws — fills what it can. */
  async enrich(info: DeviceInfo): Promise<DeviceInfo> {
    if (info.state !== 'device') return info
    try {
      const props = await this.shell(info.serial, 'getprop')
      const map = parseGetprop(props)
      info.model = map['ro.product.model'] || info.model
      info.brand = map['ro.product.brand'] || ''
      info.manufacturer = map['ro.product.manufacturer'] || ''
      info.androidVersion = map['ro.build.version.release'] || ''
      info.apiLevel = map['ro.build.version.sdk'] || ''
    } catch (err) {
      logger.warn('adb', `getprop failed for ${info.serial}: ${errMsg(err)}`)
    }
    try {
      const wm = await this.shell(info.serial, 'wm size && wm density')
      const size = wm.match(/(\d+x\d+)/)
      if (size) info.resolution = size[1]
    } catch {
      // non-fatal
    }
    try {
      const dump = await this.shell(
        info.serial,
        'dumpsys display | grep -E "mRefreshRate|renderFrameRate"',
        6000
      )
      const rate = dump.match(/(\d+\.?\d*)\s*(?:Hz|fps)/i)
      if (rate) info.refreshRate = `${Math.round(parseFloat(rate[1]))} Hz`
    } catch {
      // non-fatal
    }
    try {
      const batt = await this.shell(
        info.serial,
        'dumpsys battery | grep -E "level|temperature|health"'
      )
      const level = batt.match(/level:\s*(\d+)/)
      const temp = batt.match(/temperature:\s*(\d+)/)
      const health = batt.match(/health:\s*(\d+)/)
      if (level) info.batteryLevel = `${level[1]}%`
      if (temp) info.batteryTemp = `${(parseInt(temp[1], 10) / 10).toFixed(1)} °C`
      if (health) {
        const map: Record<string, string> = {
          '2': 'Good',
          '3': 'Overheat',
          '4': 'Dead',
          '5': 'Overvoltage',
          '7': 'Cold'
        }
        info.batteryHealth = map[health[1]] ?? `code ${health[1]}`
      }
    } catch {
      // non-fatal
    }
    try {
      const df = await this.shell(info.serial, 'df -h /data')
      const line = df.split(/\r?\n/).find((l) => l.includes('/data'))
      if (line) {
        const cols = line.split(/\s+/)
        // Filesystem Size Used Avail Use% Mounted
        if (cols.length >= 4) {
          info.storageTotal = cols[1]
          info.storageUsed = cols[2]
          const pct = cols[4]?.match(/(\d+)%/)
          if (pct) info.storagePercent = parseInt(pct[1], 10)
        }
      }
    } catch {
      // non-fatal
    }
    return info
  }

  async connectWifi(ipPort: string): Promise<void> {
    await this.raw(['connect', ipPort], 10000)
  }

  async disconnect(serial: string | 'all'): Promise<void> {
    if (serial === 'all') {
      await this.raw(['disconnect'], 8000)
    } else {
      await this.raw(['disconnect', serial], 8000)
    }
  }

  async restartServer(): Promise<void> {
    await this.raw(['kill-server'], 10000)
    await this.raw(['start-server'], 15000)
  }

  async execOut(serial: string, command: string, timeoutMs = 8000): Promise<string> {
    return this.raw(['-s', serial, 'exec-out', command], timeoutMs)
  }

  /** Run one adb subcommand with execFile semantics (used for one-shot helpers). */
  execFile(args: string[], timeoutMs = 8000): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      execFile(
        this.paths.adbExe,
        args,
        { timeout: timeoutMs, windowsHide: true },
        (err, stdout, stderr) => {
          if (err && !stdout && !stderr) reject(err)
          else resolve({ code: err && typeof (err as NodeJS.ErrnoException).code === 'number' ? 1 : 0, stdout: String(stdout), stderr: String(stderr) })
        }
      )
    })
  }
}

function parseGetprop(output: string): Record<string, string> {
  const map: Record<string, string> = {}
  // Lines like: [ro.product.model]: [Pixel 7]
  const re = /^\[([^\]]+)\]:\s*\[([^\]]*)\]/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(output)) !== null) {
    map[m[1]] = m[2]
  }
  return map
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export { runExe }
