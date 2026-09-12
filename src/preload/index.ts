import { contextBridge, ipcRenderer } from 'electron'
import type { AndroidMirrorApi, ApiEvents } from '@shared/ipc-contract'

// Returns Promise<any> by design: the object literal below is contextually
// typed as AndroidMirrorApi, so each call site gets its precise type back.
function invoke(channel: string, ...args: unknown[]): Promise<never> {
  return ipcRenderer.invoke(`am:${channel}`, ...args) as Promise<never>
}

const VALID_CHANNELS = [
  'devices',
  'sessions',
  'log',
  'adb-state',
  'device-recognized',
  'capabilities',
  'settings'
]

const api: AndroidMirrorApi = {
  getState: () => invoke('get-state'),
  listDevices: () => invoke('list-devices'),
  connectWifi: (serial, ipPort) => invoke('connect-wifi', serial, ipPort),
  disconnectDevice: (serial) => invoke('disconnect-device', serial),
  restartAdb: () => invoke('restart-adb'),
  refreshDevices: () => invoke('refresh-devices'),

  startMirror: (serial, overrides) => invoke('start-mirror', serial, overrides),
  startAudioOnly: (serial) => invoke('start-audio-only', serial),
  startStreamInput: (serial, overrides) => invoke('start-stream-input', serial, overrides),
  startRecording: (serial, overrides) => invoke('start-recording', serial, overrides),
  stopSession: (sessionId) => invoke('stop-session', sessionId),
  stopAllSessions: () => invoke('stop-all-sessions'),
  listSessions: () => invoke('list-sessions'),

  saveGlobal: (patch) => invoke('save-global', patch),
  saveProfile: (profile) => invoke('save-profile', profile),
  deleteProfile: (id) => invoke('delete-profile', id),
  duplicateProfile: (id) => invoke('duplicate-profile', id),
  bindProfileToSerial: (id, serial) => invoke('bind-profile-to-serial', id, serial),
  launchProfile: (id, serial) => invoke('launch-profile', id, serial),

  setAutoStart: (serial, auto) => invoke('set-auto-start', serial, auto),
  setKnownDeviceName: (serial, name) => invoke('set-known-device-name', serial, name),

  pickDirectory: (defaultPath) => invoke('pick-directory', defaultPath),
  openPath: (what) => invoke('open-path', what),
  exportLogs: () => invoke('export-logs'),

  setGamingPreset: (preset) => invoke('set-gaming-preset', preset),
  saveGamingCustom: (mirror) => invoke('save-gaming-custom', mirror),
  applyGamingToProfile: (id) => invoke('apply-gaming-to-profile', id),

  listEncoders: (serial) => invoke('list-encoders', serial),
  probeCapabilities: () => invoke('probe-capabilities'),

  on: (channel, listener) => {
    if (!VALID_CHANNELS.includes(channel as string)) {
      throw new Error(`Unknown subscription channel: ${String(channel)}`)
    }
    const wrapped = (_event: unknown, payload: unknown): void => {
      listener(payload as ApiEvents[typeof channel])
    }
    ipcRenderer.on(`am:${String(channel)}`, wrapped)
    return () => {
      ipcRenderer.removeListener(`am:${String(channel)}`, wrapped)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
