export type {
  AppSettingsBundle,
  Capabilities,
  DeviceInfo,
  DeviceSnapshot,
  LogEntry,
  MirrorSettings,
  Profile,
  RecordingSettings,
  AdvancedSettings,
  RunningSession,
  SessionInfo,
  SessionKind,
  KnownDevice,
  GamingSettings,
  GamingPresetId,
  GlobalSettings,
  ShortcutAction
} from '@shared/types'

export interface RecognizedDevicePopup {
  serial: string
  name: string
  profileId: string | null
  profileName: string | null
  autoStart: boolean
}
