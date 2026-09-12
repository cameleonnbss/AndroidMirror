/**
 * Shared domain types — single source of truth for main & renderer.
 */

export type ConnectionKind = 'usb' | 'wifi' | 'emulator' | 'unknown'

export interface DeviceInfo {
  serial: string
  kind: ConnectionKind
  state: 'device' | 'offline' | 'unauthorized' | 'connecting' | 'unknown'
  model: string
  brand: string
  manufacturer: string
  androidVersion: string
  apiLevel: string
  resolution: string
  refreshRate: string
  batteryLevel: string
  batteryTemp: string
  batteryHealth: string
  storageUsed: string
  storageTotal: string
  storagePercent: number | null
}

export interface KnownDevice {
  serial: string
  name: string
  lastProfileId: string | null
  lastSeen: number
  autoStart: boolean
}

export interface MirrorSettings {
  resolution: 'native' | string
  fps: 'auto' | number
  bitrateMbps: number
  videoCodec: 'h264' | 'h265' | 'av1' | 'vp8' | 'vp9'
  audioCodec: 'opus' | 'aac' | 'flac' | 'raw'
  audioEnabled: boolean
  audioSource: 'output' | 'playback' | 'mic' | 'voice-call' | 'voice-performance'
  audioBitrateKbps: number
  orientation: 'auto' | '0' | '90' | '180' | '270'
  maxFpsLock: boolean
  /** 'camera' mirrors the phone camera instead of the screen (Android 12+). */
  videoSource: 'display' | 'camera'
  cameraFacing: 'back' | 'front' | 'external'
}

export interface RecordingSettings {
  enabled: boolean
  format: 'mp4' | 'mkv' | 'm4a' | 'mka' | 'opus' | 'aac' | 'flac' | 'wav'
  directory: string
  recordAudio: boolean
  audioOnly: boolean
  fixTimestampedName: boolean
}

export interface AdvancedSettings {
  stayAwake: boolean
  turnScreenOff: boolean
  showTouches: boolean
  keepActive: boolean
  disableScreensaver: boolean
  keyboard: 'sdk' | 'uhid' | 'aoa' | 'disabled'
  mouse: 'sdk' | 'uhid' | 'aoa' | 'disabled'
  gamepad: 'disabled' | 'uhid' | 'aoa'
  clipboardAutosync: boolean
  legacyPaste: boolean
  powerOn: boolean
  powerOffOnClose: boolean
  noCleanup: boolean
  fullscreen: boolean
  alwaysOnTop: boolean
  windowBorderless: boolean
  forceAdbForward: boolean
  killAdbOnClose: boolean
  verbosity: 'verbose' | 'debug' | 'info' | 'warn' | 'error'
  shortcutMod: string
  extraArgs: string
}

export type GamingPresetId = 'low-latency' | 'balanced' | 'high-quality' | 'custom'

export interface GamingSettings {
  preset: GamingPresetId
  custom: MirrorSettings
}

export interface Profile {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  boundSerial: string | null
  mirror: MirrorSettings
  recording: RecordingSettings
  advanced: AdvancedSettings
  gaming?: GamingSettings
}

export interface GlobalSettings {
  launchOnStartup: boolean
  minimizeToTray: boolean
  autoDetectProfiles: boolean
  autoStartProfiles: boolean
  globalShortcuts: Record<ShortcutAction, string | null>
  recording: RecordingSettings
  advanced: AdvancedSettings
  gaming: GamingSettings
  mirror: MirrorSettings
}

export type ShortcutAction =
  | 'toggle-mirror'
  | 'toggle-recording'
  | 'gaming-mode'
  | 'show-app'
  | 'refresh-devices'

export type SessionKind = 'mirror' | 'audio-only' | 'recording' | 'stream-input'

export interface SessionInfo {
  sessionId: string
  serial: string
  deviceName: string
  kind: SessionKind
  startedAt: number
  args: string[]
  recordingPath: string | null
}

export interface RunningSession {
  info: SessionInfo
  elapsed: number
}

export interface LogEntry {
  id: number
  ts: number
  level: 'info' | 'warn' | 'error' | 'success' | 'cmd'
  source: string
  message: string
}

export interface Capabilities {
  scrcpyVersion: string
  videoCodecs: string[]
  audioCodecs: string[]
  recordFormats: string[]
  audioSources: string[]
  probedAt: number
  error?: string
}

export interface SerialDeviceCandidate {
  serial: string
  name: string
  profileId: string | null
  profileName: string | null
  autoStart: boolean
}

export interface DeviceSnapshot {
  devices: DeviceInfo[]
  candidates: SerialDeviceCandidate[]
  changedAt: number
}

export interface AppSettingsBundle {
  version: number
  global: GlobalSettings
  profiles: Profile[]
  knownDevices: KnownDevice[]
  recentRecordings: string[]
}

export const DEFAULT_MIRROR: MirrorSettings = {
  resolution: 'native',
  fps: 'auto',
  bitrateMbps: 8,
  videoCodec: 'h264',
  audioCodec: 'opus',
  audioEnabled: true,
  audioSource: 'output',
  audioBitrateKbps: 128,
  orientation: 'auto',
  maxFpsLock: false,
  videoSource: 'display',
  cameraFacing: 'back'
}

export const DEFAULT_RECORDING: RecordingSettings = {
  enabled: false,
  format: 'mp4',
  directory: '',
  recordAudio: true,
  audioOnly: false,
  fixTimestampedName: true
}

export const DEFAULT_ADVANCED: AdvancedSettings = {
  stayAwake: false,
  turnScreenOff: false,
  showTouches: false,
  keepActive: false,
  disableScreensaver: true,
  keyboard: 'sdk',
  mouse: 'sdk',
  gamepad: 'disabled',
  clipboardAutosync: true,
  legacyPaste: false,
  powerOn: true,
  powerOffOnClose: false,
  noCleanup: false,
  fullscreen: false,
  alwaysOnTop: false,
  windowBorderless: false,
  forceAdbForward: false,
  killAdbOnClose: false,
  verbosity: 'info',
  shortcutMod: 'lalt,lsuper',
  extraArgs: ''
}

export const DEFAULT_GAMING: GamingSettings = {
  preset: 'balanced',
  custom: { ...DEFAULT_MIRROR }
}

export const SHORTCUT_DEFAULTS: Record<ShortcutAction, string> = {
  'toggle-mirror': 'F8',
  'toggle-recording': 'F9',
  'gaming-mode': 'F10',
  'show-app': 'F7',
  'refresh-devices': 'F5'
}
