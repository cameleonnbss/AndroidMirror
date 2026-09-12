import fs from 'node:fs'
import path from 'node:path'
import type {
  AppSettingsBundle,
  KnownDevice,
  Profile,
  GlobalSettings,
  MirrorSettings,
  RecordingSettings,
  AdvancedSettings,
  GamingSettings,
  ShortcutAction
} from '@shared/types'
import {
  DEFAULT_MIRROR,
  DEFAULT_RECORDING,
  DEFAULT_ADVANCED,
  DEFAULT_GAMING,
  SHORTCUT_DEFAULTS
} from '@shared/types'

const SCHEMA_VERSION = 1

function mirror(p?: Partial<MirrorSettings>): MirrorSettings {
  return { ...DEFAULT_MIRROR, ...(p ?? {}) }
}
function recording(p?: Partial<RecordingSettings>): RecordingSettings {
  return { ...DEFAULT_RECORDING, ...(p ?? {}) }
}
function advanced(p?: Partial<AdvancedSettings>): AdvancedSettings {
  return { ...DEFAULT_ADVANCED, ...(p ?? {}) }
}
function gaming(p?: Partial<GamingSettings>): GamingSettings {
  if (!p) return { ...DEFAULT_GAMING, custom: { ...DEFAULT_GAMING.custom } }
  return { preset: p.preset ?? DEFAULT_GAMING.preset, custom: mirror(p.custom) }
}

/** Backfills any missing field so old/partial config files keep working. */
export function migrateSettings(raw: unknown): AppSettingsBundle {
  const data = (raw ?? {}) as Record<string, unknown>
  const g = (data.global ?? {}) as Record<string, unknown>

  const global: GlobalSettings = {
    launchOnStartup: Boolean(g.launchOnStartup),
    minimizeToTray: g.minimizeToTray !== false,
    autoDetectProfiles: g.autoDetectProfiles !== false,
    autoStartProfiles: Boolean(g.autoStartProfiles),
    globalShortcuts: {
      ...SHORTCUT_DEFAULTS,
      ...((g.globalShortcuts ?? {}) as Record<ShortcutAction, string>)
    },
    mirror: mirror(g.mirror as MirrorSettings),
    recording: recording(g.recording as RecordingSettings),
    advanced: advanced(g.advanced as AdvancedSettings),
    gaming: gaming(g.gaming as GamingSettings)
  }

  const profiles: Profile[] = Array.isArray(data.profiles)
    ? data.profiles.map((p) => {
        const prof = p as Record<string, unknown>
        return {
          id: String(prof.id ?? `profile-${Date.now()}-${Math.floor(Math.random() * 1e6)}`),
          name: String(prof.name ?? 'Profile'),
          createdAt: Number(prof.createdAt ?? Date.now()),
          updatedAt: Number(prof.updatedAt ?? Date.now()),
          boundSerial: (prof.boundSerial as string | null) ?? null,
          mirror: mirror(prof.mirror as MirrorSettings),
          recording: recording(prof.recording as RecordingSettings),
          advanced: advanced(prof.advanced as AdvancedSettings),
          gaming: prof.gaming ? gaming(prof.gaming as GamingSettings) : undefined
        }
      })
    : []

  const knownDevices: KnownDevice[] = Array.isArray(data.knownDevices)
    ? data.knownDevices.map((d) => {
        const k = d as Record<string, unknown>
        return {
          serial: String(k.serial ?? ''),
          name: String(k.name ?? ''),
          lastProfileId: (k.lastProfileId as string | null) ?? null,
          lastSeen: Number(k.lastSeen ?? 0),
          autoStart: Boolean(k.autoStart)
        }
      })
    : []

  return {
    version: SCHEMA_VERSION,
    global,
    profiles,
    knownDevices,
    recentRecordings: Array.isArray(data.recentRecordings)
      ? data.recentRecordings.map(String).slice(0, 50)
      : []
  }
}

type SettingsListener = (bundle: AppSettingsBundle) => void

export class SettingsStore {
  private data: AppSettingsBundle
  private file: string
  private listeners = new Set<SettingsListener>()

  constructor(configDir: string) {
    this.file = path.join(configDir, 'androidmirror-settings.json')
    this.data = this.load()
  }

  /** Subscribes to every mutation; used to push settings to the renderer. */
  onSettingsChanged(listener: SettingsListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private load(): AppSettingsBundle {
    try {
      const text = fs.readFileSync(this.file, 'utf8')
      return migrateSettings(JSON.parse(text))
    } catch {
      return migrateSettings({})
    }
  }

  private persist(): void {
    try {
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      fs.renameSync(tmp, this.file)
    } catch (err) {
      // Persistence failure must not crash the app.
      console.error('[store] failed to persist settings:', err)
    }
    for (const l of this.listeners) {
      try {
        l(this.data)
      } catch {
        // listener errors must not break persistence
      }
    }
  }

  get bundle(): AppSettingsBundle {
    return this.data
  }

  get global(): GlobalSettings {
    return this.data.global
  }

  setGlobal(patch: Partial<GlobalSettings>): void {
    this.data.global = { ...this.data.global, ...patch }
    this.persist()
  }

  get profiles(): Profile[] {
    return this.data.profiles
  }

  saveProfile(profile: Profile): void {
    const list = this.data.profiles
    const idx = list.findIndex((p) => p.id === profile.id)
    profile.updatedAt = Date.now()
    if (idx >= 0) list[idx] = profile
    else list.push(profile)
    this.persist()
  }

  deleteProfile(id: string): void {
    this.data.profiles = this.data.profiles.filter((p) => p.id !== id)
    this.data.knownDevices = this.data.knownDevices.map((d) =>
      d.lastProfileId === id ? { ...d, lastProfileId: null } : d
    )
    this.persist()
  }

  duplicateProfile(id: string): Profile | null {
    const src = this.data.profiles.find((p) => p.id === id)
    if (!src) return null
    const copy: Profile = JSON.parse(JSON.stringify(src))
    copy.id = `profile-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    copy.name = `${src.name} (copy)`
    copy.createdAt = Date.now()
    copy.updatedAt = Date.now()
    this.saveProfile(copy)
    return copy
  }

  getProfile(id: string): Profile | null {
    return this.data.profiles.find((p) => p.id === id) ?? null
  }

  get knownDevices(): KnownDevice[] {
    return this.data.knownDevices
  }

  upsertKnownDevice(serial: string, patch: Partial<KnownDevice>): KnownDevice {
    const list = this.data.knownDevices
    const idx = list.findIndex((d) => d.serial === serial)
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch, serial }
      this.persist()
      return list[idx]
    }
    const created: KnownDevice = {
      serial,
      name: '',
      lastProfileId: null,
      lastSeen: Date.now(),
      autoStart: false,
      ...patch
    }
    list.push(created)
    this.persist()
    return created
  }

  getKnownDevice(serial: string): KnownDevice | null {
    return this.data.knownDevices.find((d) => d.serial === serial) ?? null
  }

  pushRecentRecording(file: string): void {
    this.data.recentRecordings = [
      file,
      ...this.data.recentRecordings.filter((f) => f !== file)
    ].slice(0, 50)
    this.persist()
  }

  export(): AppSettingsBundle {
    return this.data
  }
}

// Late-initialized singleton: bootstrap() calls initStore() before any consumer
// touches `store`. ESM live bindings keep references valid after assignment.
export let store: SettingsStore

export function initStore(configDir: string): SettingsStore {
  store = new SettingsStore(configDir)
  return store
}
