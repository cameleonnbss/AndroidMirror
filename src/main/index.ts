import { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { runtimePaths, ensureDirs } from './paths'
import type { RuntimePaths } from './paths'
import { logger } from './logger'
import { store, initStore } from './store'
import { AdbService } from './adb'
import { DeviceWatcher } from './device-watcher'
import { SessionManager } from './session-manager'
import { probeCapabilities, listDeviceEncoders } from './capabilities'
import type { OpResult } from '@shared/ipc-contract'
import type {
  Capabilities,
  GlobalSettings,
  GamingPresetId,
  MirrorSettings,
  Profile,
  RecordingSettings
} from '@shared/types'
import { GAMING_PRESETS } from '@shared/scrcpy-catalog'

interface Services {
  paths: RuntimePaths
  adb: AdbService
  watcher: DeviceWatcher
  sessions: SessionManager
  capabilities: Capabilities | null
}

let mainWindow: BrowserWindow | null = null
let services: Services | null = null
let applyShortcuts: (() => void) | null = null
let tray: Tray | null = null
let quitting = false

const paths: RuntimePaths = runtimePaths()

function broadcast(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`am:${channel}`, payload)
  }
}

function makeOp(ok: boolean, message: string, extra?: Partial<OpResult>): OpResult {
  return { ok, message, ...extra }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function createTray(): void {
  try {
    const icon = nativeImage.createFromPath(paths.appIcon)
    tray = new Tray(icon)
    tray.setToolTip('AndroidMirror')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Show AndroidMirror',
          click: () => {
            if (mainWindow) {
              mainWindow.show()
              mainWindow.focus()
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
    )
    tray.on('double-click', () => mainWindow?.show())
  } catch (err) {
    logger.warn('app', `Tray unavailable: ${errMsg(err)}`)
  }
}

function recordingDir(): string {
  return store.global.recording.directory || paths.defaultRecordingsDir
}

function gamingMirror(g: GlobalSettings['gaming']): MirrorSettings {
  return g.preset === 'custom' ? { ...g.custom } : { ...GAMING_PRESETS[g.preset].mirror }
}

// --------------------------------------------------------------------------
// Window
// --------------------------------------------------------------------------

function createWindow(): void {
  // Content-Security-Policy is delivered as a response header (works in the
  // packaged app without breaking the Vite dev server, which serves over http).
  const applyCsp = (): void => {
    if (!mainWindow) return
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
          ]
        }
      })
    })
  }

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1040,
    minHeight: 660,
    show: false,
    backgroundColor: '#0b0f14',
    title: 'AndroidMirror',
    icon: paths.appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  applyCsp()
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Minimize-to-tray: closing the window keeps sessions alive in the tray.
  mainWindow.on('close', (e) => {
    if (store.global.minimizeToTray && !quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// --------------------------------------------------------------------------
// Bootstrap
// --------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  ensureDirs(paths)
  initStore(paths.configDir)
  logger.init(paths.logsDir)
  logger.info('app', `AndroidMirror ${app.getVersion()} starting`)

  const adb = new AdbService(paths)
  const watcher = new DeviceWatcher(adb, store)
  const sessions = new SessionManager(paths, store, watcher)
  services = { paths, adb, watcher, sessions, capabilities: null }

  registerIpc()
  registerBroadcasts()
  deviceRecognizedFlow()

  createWindow()

  const ready = await adb.check()
  if (ready) logger.success('adb', `ADB ready (${adb.version})`)
  else logger.error('adb', `ADB not available at ${paths.adbExe} — device features disabled`)

  services.capabilities = await probeCapabilities(paths, adb)
  broadcast('capabilities', services.capabilities)

  watcher.start()
  createTray()
  applyShortcuts = registerShortcuts()
  logger.success('app', 'AndroidMirror ready')
}

function registerBroadcasts(): void {
  if (!services) return
  services.watcher.onSnapshot((snapshot) => broadcast('devices', snapshot))
  services.sessions.onSessions((list) => broadcast('sessions', list))
  logger.subscribe((entry) => broadcast('log', entry))
  // Keep the renderer's settings snapshot in sync with every store mutation
  // (gaming presets, profile saves, mirror tweaks…) that happen in main.
  store.onSettingsChanged((bundle) => broadcast('settings', bundle))
}

function deviceRecognizedFlow(): void {
  if (!services) return
  services.watcher.onRecognized((serial) => {
    if (!store.global.autoDetectProfiles) return
    const known = store.getKnownDevice(serial)
    const profile = known?.lastProfileId ? store.getProfile(known.lastProfileId) : null
    const device = services?.watcher.getSnapshot().devices.find((d) => d.serial === serial)

    broadcast('device-recognized', {
      serial,
      name: known?.name || device?.model || serial,
      profileId: profile?.id ?? null,
      profileName: profile?.name ?? null,
      autoStart: known?.autoStart ?? false
    })

    if (known?.autoStart && profile) {
      logger.info('profiles', `Auto-starting profile "${profile.name}" for ${serial}`)
      void services?.sessions.start(
        profile.recording.enabled ? 'recording' : 'mirror',
        serial,
        { ...profile.mirror },
        profile.recording.enabled ? { ...profile.recording } : null
      )
    }
  })
}

// --------------------------------------------------------------------------
// Global shortcuts
// --------------------------------------------------------------------------

function registerShortcuts(): () => void {
  const apply = (): void => {
    globalShortcut.unregisterAll()
    const sc = store.global.globalShortcuts
    const firstSerial = (): string | undefined =>
      services?.watcher.getSnapshot().candidates[0]?.serial

    const tryReg = (accel: string | null | undefined, fn: () => void): void => {
      if (!accel) return
      try {
        const ok = globalShortcut.register(accel, fn)
        if (!ok) logger.warn('shortcuts', `Shortcut busy, not registered: ${accel}`)
      } catch (err) {
        logger.warn('shortcuts', `Could not register ${accel}: ${errMsg(err)}`)
      }
    }

    tryReg(sc['toggle-mirror'], () => {
      if (!services) return
      const active = services.sessions.list().filter((s) => s.info.kind === 'mirror')
      if (active.length > 0) services.sessions.stopAll()
      else {
        const serial = firstSerial()
        if (serial) void services.sessions.start('mirror', serial)
      }
    })
    tryReg(sc['toggle-recording'], () => {
      if (!services) return
      const rec = services.sessions.list().find((s) => s.info.kind === 'recording')
      if (rec) services.sessions.stop(rec.info.sessionId)
      else {
        const serial = firstSerial()
        if (serial) void services.sessions.start('recording', serial)
      }
    })
    tryReg(sc['gaming-mode'], () => {
      if (!services) return
      const serial = firstSerial()
      if (serial) void services.sessions.start('mirror', serial, gamingMirror(store.global.gaming))
    })
    tryReg(sc['show-app'], () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      }
    })
    tryReg(sc['refresh-devices'], () => {
      void services?.watcher.refreshOnce()
    })
  }

  apply()
  return apply
}

// --------------------------------------------------------------------------
// IPC
// --------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- IPC boundary: payloads are
   validated by the caller signatures compiled against AndroidMirrorApi. */
function handle(channel: string, fn: (...args: any[]) => unknown): void {
  ipcMain.handle(`am:${channel}`, async (_event, ...args: unknown[]) => {
    try {
      return await fn(...args)
    } catch (err) {
      logger.error('ipc', `${channel} failed: ${errMsg(err)}`)
      throw err
    }
  })
}

function registerIpc(): void {
  // ---- state & devices ----------------------------------------------------
  handle('get-state', () => ({
    settings: store.export(),
    devices: services?.watcher.getSnapshot() ?? { devices: [], candidates: [], changedAt: 0 },
    sessions: services?.sessions.list() ?? [],
    capabilities: services?.capabilities ?? null,
    logs: logger.getEntries(),
    adb: {
      ready: services?.adb.ready ?? false,
      version: services?.adb.version ?? null,
      path: paths.adbExe
    }
  }))

  handle('list-devices', () => services?.watcher.getSnapshot() ?? null)
  handle('refresh-devices', async () => services?.watcher.refreshOnce())

  handle('connect-wifi', async (ipPort: string): Promise<OpResult> => {
    try {
      await services?.adb.connectWifi(ipPort)
      await services?.watcher.refreshOnce()
      logger.success('adb', `Connected over Wi-Fi: ${ipPort}`)
      return makeOp(true, `Connected to ${ipPort}`)
    } catch (err) {
      logger.error('adb', `Wi-Fi connect failed: ${errMsg(err)}`)
      return makeOp(false, errMsg(err))
    }
  })

  handle('disconnect-device', async (serial: string): Promise<OpResult> => {
    try {
      await services?.adb.disconnect(serial)
      await services?.watcher.refreshOnce()
      return makeOp(true, 'Disconnected')
    } catch (err) {
      return makeOp(false, errMsg(err))
    }
  })

  handle('restart-adb', async (): Promise<OpResult> => {
    try {
      await services?.adb.restartServer()
      await services?.adb.check()
      await services?.watcher.refreshOnce()
      logger.success('adb', 'ADB server restarted')
      return makeOp(true, 'ADB server restarted')
    } catch (err) {
      return makeOp(false, errMsg(err))
    }
  })

  // ---- sessions ------------------------------------------------------------
  handle('start-mirror', async (serial: string, overrides?: Partial<MirrorSettings> | null) => {
    if (!services) return makeOp(false, 'App not ready')
    return services.sessions.start('mirror', serial, overrides ?? null, null)
  })

  handle('start-audio-only', async (serial: string) => {
    if (!services) return makeOp(false, 'App not ready')
    return services.sessions.start('audio-only', serial, { audioEnabled: true }, null)
  })

  // Phone-as-webcam / OBS input: borderless, always-on-top, no decorations.
  handle('start-stream-input', async (serial: string, overrides?: Partial<MirrorSettings> | null) => {
    if (!services) return makeOp(false, 'App not ready')
    return services.sessions.start('stream-input', serial, overrides ?? null, null)
  })

  handle('start-recording', async (serial: string, overrides?: Partial<RecordingSettings> | null) => {
    if (!services) return makeOp(false, 'App not ready')
    return services.sessions.start('recording', serial, null, overrides ?? null)
  })

  handle('stop-session', (sessionId: string) => {
    if (!services) return makeOp(false, 'App not ready')
    const r = services.sessions.stop(sessionId)
    return makeOp(r.ok, r.message)
  })

  handle('stop-all-sessions', () => {
    if (!services) return makeOp(false, 'App not ready')
    const n = services.sessions.stopAll()
    return makeOp(true, n > 0 ? `${n} session(s) stopped` : 'No running session')
  })

  handle('list-sessions', () => services?.sessions.list() ?? [])

  // ---- settings & profiles --------------------------------------------------
  handle('save-global', (patch: Partial<GlobalSettings>) => {
    store.setGlobal(patch)
    logger.info('settings', 'Settings saved')
    if (patch.globalShortcuts) applyShortcuts?.()
    if (patch.launchOnStartup !== undefined && process.platform === 'win32') {
      app.setLoginItemSettings({ openAtLogin: patch.launchOnStartup })
    }
    return makeOp(true, 'Settings saved')
  })

  handle('save-profile', (profile: Profile) => {
    store.saveProfile(profile)
    logger.info('profiles', `Profile saved: ${profile.name}`)
    return makeOp(true, 'Profile saved')
  })

  handle('delete-profile', (id: string) => {
    store.deleteProfile(id)
    logger.info('profiles', `Profile deleted: ${id}`)
    return makeOp(true, 'Profile deleted')
  })

  handle('duplicate-profile', (id: string) => {
    const copy = store.duplicateProfile(id)
    return copy ? makeOp(true, 'Profile duplicated') : makeOp(false, 'Profile not found')
  })

  handle('bind-profile-to-serial', (id: string, serial: string | null) => {
    const p = store.getProfile(id)
    if (!p) return makeOp(false, 'Profile not found')
    p.boundSerial = serial
    store.saveProfile(p)
    return makeOp(true, 'Binding updated')
  })

  handle('launch-profile', async (id: string, serial: string): Promise<OpResult> => {
    if (!services) return makeOp(false, 'App not ready')
    const p = store.getProfile(id)
    if (!p) return makeOp(false, 'Profile not found')
    const r = await services.sessions.start(
      p.recording.enabled ? 'recording' : 'mirror',
      serial,
      { ...p.mirror },
      p.recording.enabled ? { ...p.recording } : null
    )
    if (r.ok) {
      store.upsertKnownDevice(serial, { lastProfileId: id, lastSeen: Date.now() })
    }
    return r
  })

  handle('set-auto-start', (serial: string, auto: boolean) => {
    store.upsertKnownDevice(serial, { autoStart: auto, lastSeen: Date.now() })
    return makeOp(true, auto ? 'Auto-start enabled' : 'Auto-start disabled')
  })

  handle('set-known-device-name', (serial: string, name: string) => {
    store.upsertKnownDevice(serial, { name })
    return makeOp(true, 'Name saved')
  })

  // ---- files & logs ---------------------------------------------------------
  handle('pick-directory', async (defaultPath?: string): Promise<string | null> => {
    const res = await dialog.showOpenDialog({
      title: 'Choose a folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath
    })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  handle('open-path', (what: 'logs' | 'recordings' | 'config') => {
    const map: Record<typeof what, string> = {
      logs: paths.logsDir,
      recordings: recordingDir(),
      config: paths.configDir
    }
    void shell.openPath(map[what])
    return makeOp(true, 'Opened')
  })

  handle('export-logs', async (): Promise<string | null> => {
    const res = await dialog.showSaveDialog({
      title: 'Export logs',
      defaultPath: 'androidmirror-logs.txt',
      filters: [{ name: 'Text', extensions: ['txt'] }]
    })
    if (res.canceled || !res.filePath) return null
    const text = logger
      .getEntries()
      .map(
        (e) =>
          `[${new Date(e.ts).toISOString()}] [${e.level.toUpperCase()}] [${e.source}] ${e.message}`
      )
      .join('\n')
    fs.writeFileSync(res.filePath, text, 'utf8')
    return res.filePath
  })

  // ---- gaming -----------------------------------------------------------------
  handle('set-gaming-preset', (preset: GamingPresetId) => {
    // Never overwrite the user's custom tuning when (re)selecting Custom.
    const custom =
      preset === 'custom'
        ? store.global.gaming.custom
        : { ...GAMING_PRESETS[preset].mirror }
    const g = { ...store.global.gaming, preset, custom }
    store.setGlobal({ gaming: g })
    logger.info('gaming', `Gaming preset applied: ${GAMING_PRESETS[preset].label}`)
    return makeOp(true, `Preset applied: ${GAMING_PRESETS[preset].label}`)
  })

  handle('save-gaming-custom', (mirror: MirrorSettings) => {
    store.setGlobal({ gaming: { preset: 'custom', custom: mirror } })
    return makeOp(true, 'Custom gaming config saved')
  })

  handle('apply-gaming-to-profile', (profileId: string) => {
    const p = store.getProfile(profileId)
    if (!p) return makeOp(false, 'Profile not found')
    const gm = store.global.gaming
    p.gaming = { ...gm, custom: { ...gm.custom } }
    p.mirror = gamingMirror(gm)
    store.saveProfile(p)
    return makeOp(true, 'Gaming config copied into profile')
  })

  // ---- capabilities -------------------------------------------------------------
  handle('list-encoders', async (serial: string): Promise<OpResult> => {
    const out = await listDeviceEncoders(paths, serial)
    const trimmed = out.trim()
    logger.info('scrcpy', `Encoders for ${serial}:\n${trimmed || '(no output)'}`)
    return makeOp(true, trimmed || 'No encoder info returned')
  })

  handle('probe-capabilities', async () => {
    if (!services) throw new Error('App not ready')
    services.capabilities = await probeCapabilities(paths, services.adb)
    broadcast('capabilities', services.capabilities)
    return services.capabilities
  })
}

// --------------------------------------------------------------------------
// App lifecycle
// --------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    void bootstrap()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    quitting = true
    services?.sessions.shutdown()
    services?.watcher.stop()
    globalShortcut.unregisterAll()
  })
}
