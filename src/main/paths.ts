import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

/**
 * Resolves every runtime path used by the app, both in dev and when packaged.
 * Binaries (scrcpy.exe, adb.exe, scrcpy-server, *.dll) ship as extraResources
 * so they live outside the asar archive.
 */
export function runtimePaths() {
  const isPackaged = app.isPackaged
  const resourcesRoot = isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources')
  // Portable build (single self-extracting exe): electron-builder exposes the
  // real exe location via PORTABLE_EXECUTABLE_DIR. Keep ALL user data next to
  // the exe so the app is fully self-contained and nomad-friendly.
  const portableDir = process.env['PORTABLE_EXECUTABLE_DIR']
  const userData = portableDir
    ? path.join(portableDir, 'AndroidMirrorData')
    : app.getPath('userData')

  const scrcpyDir = path.join(resourcesRoot, 'scrcpy')

  const profile = {
    isPackaged,
    resourcesRoot,
    userData,
    scrcpyExe: path.join(scrcpyDir, 'scrcpy.exe'),
    scrcpyServer: path.join(scrcpyDir, 'scrcpy-server'),
    adbExe: path.join(scrcpyDir, 'adb.exe'),
    // App icon: assets/icon in dev, shipped under resources/icon when packaged.
    appIcon: isPackaged
      ? path.join(resourcesRoot, 'icon', 'icon.png')
      : path.join(app.getAppPath(), 'assets', 'icon', 'icon.png'),
    licensesDir: path.join(resourcesRoot, 'LICENSES'),
    // Persistent data lives in %APPDATA%/AndroidMirror
    configDir: path.join(userData, 'config'),
    logsDir: path.join(userData, 'logs'),
    defaultRecordingsDir: path.join(userData, 'recordings'),
    profilesDir: path.join(userData, 'profiles'),
    appVersion: app.getVersion()
  }
  return profile
}

export type RuntimePaths = ReturnType<typeof runtimePaths>

export function ensureDirs(paths: RuntimePaths): void {
  for (const dir of [paths.configDir, paths.logsDir, paths.defaultRecordingsDir, paths.profilesDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}
