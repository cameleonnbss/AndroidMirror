import { create } from 'zustand'
import type {
  AppSettingsBundle,
  Capabilities,
  DeviceSnapshot,
  LogEntry,
  RunningSession,
  RecognizedDevicePopup
} from './renderer-types'
import type { AdbInfo } from '@shared/ipc-contract'

const EMPTY_DEVICES: DeviceSnapshot = { devices: [], candidates: [], changedAt: 0 }

interface AppState {
  loaded: boolean
  settings: AppSettingsBundle | null
  devices: DeviceSnapshot
  sessions: RunningSession[]
  capabilities: Capabilities | null
  logs: LogEntry[]
  adb: AdbInfo
  popup: RecognizedDevicePopup | null
  page: string

  setPage: (page: string) => void
  init: () => Promise<void>
  refresh: () => Promise<void>
  setPopup: (p: RecognizedDevicePopup | null) => void
  clearLogs: () => void
}

export const useApp = create<AppState>((set, get) => ({
  loaded: false,
  settings: null,
  devices: EMPTY_DEVICES,
  sessions: [],
  capabilities: null,
  logs: [],
  adb: { ready: false, version: null, path: null },
  popup: null,
  page: 'home',

  setPage: (page) => set({ page }),

  refresh: async () => {
    const snap = await window.api.refreshDevices()
    set({ devices: snap })
  },

  init: async () => {
    const state = await window.api.getState()
    set({
      loaded: true,
      settings: state.settings,
      devices: state.devices,
      sessions: state.sessions,
      capabilities: state.capabilities,
      logs: state.logs,
      adb: state.adb
    })

    window.api.on('devices', (snapshot) => set({ devices: snapshot }))
    window.api.on('sessions', (list) => set({ sessions: list }))
    // Main pushes every settings mutation (gaming preset clicks, profile saves…)
    // so the UI never shows a stale config after an IPC round-trip.
    window.api.on('settings', (bundle) => set({ settings: bundle }))
    window.api.on('log', (entry) => {
      const logs = [...get().logs, entry]
      if (logs.length > 2000) logs.splice(0, logs.length - 2000)
      set({ logs })
    })
    window.api.on('capabilities', (caps) => set({ capabilities: caps }))
    window.api.on('device-recognized', (evt) => {
      if (!get().settings?.global.autoDetectProfiles) return
      set({ popup: evt })
    })
  },

  setPopup: (popup) => set({ popup }),
  clearLogs: () => set({ logs: [] })
}))
