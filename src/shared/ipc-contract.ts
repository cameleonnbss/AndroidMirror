import type {
  AppSettingsBundle,
  Capabilities,
  DeviceSnapshot,
  GamingPresetId,
  GlobalSettings,
  LogEntry,
  MirrorSettings,
  Profile,
  RecordingSettings,
  RunningSession
} from './types'

export interface OpResult {
  ok: boolean
  message: string
  sessionId?: string
  recordingPath?: string
}

export interface AdbInfo {
  ready: boolean
  version: string | null
  path: string | null
}

export interface RecognizedDeviceEvent {
  serial: string
  name: string
  profileId: string | null
  profileName: string | null
  autoStart: boolean
}

export interface ApiEvents {
  devices: DeviceSnapshot
  sessions: RunningSession[]
  log: LogEntry
  'adb-state': AdbInfo
  'device-recognized': RecognizedDeviceEvent
  capabilities: Capabilities
  settings: AppSettingsBundle
}

export interface AndroidMirrorApi {
  getState(): Promise<{
    settings: AppSettingsBundle
    devices: DeviceSnapshot
    sessions: RunningSession[]
    capabilities: Capabilities | null
    logs: LogEntry[]
    adb: AdbInfo
  }>

  listDevices(): Promise<DeviceSnapshot>
  connectWifi(serial: string, ipPort: string): Promise<OpResult>
  disconnectDevice(serial: 'all' | string): Promise<OpResult>
  restartAdb(): Promise<OpResult>
  refreshDevices(): Promise<DeviceSnapshot>

  startMirror(serial: string, overrides?: Partial<MirrorSettings> | null): Promise<OpResult>
  startAudioOnly(serial: string): Promise<OpResult>
  startStreamInput(serial: string, overrides?: Partial<MirrorSettings> | null): Promise<OpResult>
  startRecording(serial: string, overrides?: Partial<RecordingSettings> | null): Promise<OpResult>
  stopSession(sessionId: string): Promise<OpResult>
  stopAllSessions(): Promise<OpResult>
  listSessions(): Promise<RunningSession[]>

  saveGlobal(patch: Partial<GlobalSettings>): Promise<OpResult>
  saveProfile(profile: Profile): Promise<OpResult>
  deleteProfile(id: string): Promise<OpResult>
  duplicateProfile(id: string): Promise<OpResult>
  bindProfileToSerial(id: string, serial: string | null): Promise<OpResult>
  launchProfile(id: string, serial: string): Promise<OpResult>

  setAutoStart(serial: string, auto: boolean): Promise<OpResult>
  setKnownDeviceName(serial: string, name: string): Promise<OpResult>

  pickDirectory(defaultPath?: string): Promise<string | null>
  openPath(path: 'logs' | 'recordings' | 'config'): Promise<OpResult>
  exportLogs(): Promise<string | null>

  setGamingPreset(preset: GamingPresetId): Promise<OpResult>
  saveGamingCustom(mirror: MirrorSettings): Promise<OpResult>
  applyGamingToProfile(profileId: string): Promise<OpResult>

  listEncoders(serial: string): Promise<OpResult>
  probeCapabilities(): Promise<Capabilities>

  on<K extends keyof ApiEvents>(channel: K, listener: (payload: ApiEvents[K]) => void): () => void
}
