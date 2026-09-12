import type { DeviceSnapshot, DeviceInfo, SerialDeviceCandidate } from '@shared/types'
import type { AdbService } from './adb'
import type { SettingsStore } from './store'
import { logger } from './logger'

const POLL_INTERVAL_MS = 2500

type SnapshotListener = (snapshot: DeviceSnapshot) => void
type RecognizedListener = (serial: string, device: DeviceInfo) => void

function deviceDisplayName(info: DeviceInfo): string {
  const brand = info.brand || info.manufacturer || ''
  const model = info.model || info.serial
  const pretty = brand && !model.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${model}`
    : model
  return pretty || info.serial
}

export class DeviceWatcher {
  private adb: AdbService
  private store: SettingsStore
  private timer: NodeJS.Timeout | null = null
  private snapshot: DeviceSnapshot = { devices: [], candidates: [], changedAt: 0 }
  private snapshotListeners = new Set<SnapshotListener>()
  private recognizedListeners = new Set<RecognizedListener>()
  private knownSerials = new Set<string>()
  private polling = false

  constructor(adb: AdbService, store: SettingsStore) {
    this.adb = adb
    this.store = store
  }

  start(): void {
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  onSnapshot(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener)
    return () => this.snapshotListeners.delete(listener)
  }

  onRecognized(listener: RecognizedListener): () => void {
    this.recognizedListeners.add(listener)
    return () => this.recognizedListeners.delete(listener)
  }

  getSnapshot(): DeviceSnapshot {
    return this.snapshot
  }

  async refreshOnce(): Promise<DeviceSnapshot> {
    await this.poll()
    return this.snapshot
  }

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      if (!this.adb.ready) {
        await this.adb.check()
      }
      if (!this.adb.ready) {
        if (this.snapshot.devices.length > 0) {
          this.snapshot = { devices: [], candidates: [], changedAt: Date.now() }
          this.emitSnapshot()
        }
        return
      }

      const devices = await this.adb.listDevices()
      // Enrich concurrently; adb handles serial traffic fine.
      const enriched = await Promise.all(devices.map((d) => this.adb.enrich(d)))
      this.buildSnapshot(enriched)
      this.emitSnapshot()
      this.detectNewDevices(enriched)
    } catch (err) {
      logger.warn('devices', `Poll failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      this.polling = false
    }
  }

  private buildSnapshot(devices: DeviceInfo[]): void {
    const candidates: SerialDeviceCandidate[] = []
    for (const d of devices) {
      if (d.state !== 'device') continue
      const known = this.store.getKnownDevice(d.serial)
      const profile = known?.lastProfileId ? this.store.getProfile(known.lastProfileId) : null
      candidates.push({
        serial: d.serial,
        name: known?.name || deviceDisplayName(d),
        profileId: profile?.id ?? null,
        profileName: profile?.name ?? null,
        autoStart: known?.autoStart ?? false
      })
    }
    this.snapshot = { devices, candidates, changedAt: Date.now() }
  }

  private detectNewDevices(devices: DeviceInfo[]): void {
    for (const d of devices) {
      if (d.state !== 'device') continue
      if (!this.knownSerials.has(d.serial)) {
        this.knownSerials.add(d.serial)
        const displayName = deviceDisplayName(d)
        logger.success(
          'devices',
          `Device detected: ${displayName} (${d.serial}, ${d.kind}, Android ${d.androidVersion || '?'})`
        )
        // Register in known devices so it appears in the auto-start UI.
        const known = this.store.upsertKnownDevice(d.serial, { lastSeen: Date.now() })
        if (!known.name) {
          this.store.upsertKnownDevice(d.serial, { name: displayName })
        }
        const profile = known?.lastProfileId ? this.store.getProfile(known.lastProfileId) : null
        for (const l of this.recognizedListeners) {
          try {
            l(d.serial, d)
          } catch {
            // listener errors must not break polling
          }
        }
        if (profile) {
          logger.info('devices', `Profile matched for ${displayName}: ${profile.name}`)
        }
      }
    }
    // Prune vanished serials
    const present = new Set(devices.filter((d) => d.state === 'device').map((d) => d.serial))
    for (const serial of [...this.knownSerials]) {
      if (!present.has(serial)) {
        this.knownSerials.delete(serial)
        logger.warn('devices', `Device disconnected: ${serial}`)
      }
    }
  }

  private emitSnapshot(): void {
    for (const l of this.snapshotListeners) {
      try {
        l(this.snapshot)
      } catch {
        // ignore
      }
    }
  }
}
