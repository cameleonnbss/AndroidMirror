import { execFile } from 'node:child_process'
import { VIDEO_CODECS, AUDIO_CODECS, RECORD_FORMATS, AUDIO_SOURCES } from '@shared/scrcpy-catalog'
import type { Capabilities } from '@shared/types'
import type { RuntimePaths } from './paths'
import type { AdbService } from './adb'
import { logger } from './logger'

/**
 * Static capability catalog for the bundled scrcpy build (verified against
 * `scrcpy --help` of the shipped v4.1), plus per-device encoder probing.
 */
export async function probeCapabilities(paths: RuntimePaths, adb: AdbService): Promise<Capabilities> {
  const caps: Capabilities = {
    scrcpyVersion: '',
    videoCodecs: VIDEO_CODECS.map((c) => c.value),
    audioCodecs: [...AUDIO_CODECS],
    recordFormats: [...RECORD_FORMATS],
    audioSources: AUDIO_SOURCES.map((s) => s.value),
    probedAt: Date.now()
  }

  // 1) scrcpy version via `scrcpy --version` (already captured at scaffold).
  caps.scrcpyVersion = await new Promise<string>((resolve) => {
    execFile(paths.scrcpyExe, ['--version'], { windowsHide: true, timeout: 6000 }, (err, stdout) => {
      const m = String(stdout).match(/scrcpy\s+([\d.]+)/)
      if (m) resolve(m[1])
      else resolve(err ? '' : 'unknown')
    })
  })

  // 2) ADB presence.
  await adb.check()
  if (!adb.ready) {
    caps.error = 'ADB is not available'
    logger.warn('capabilities', caps.error)
  }
  return caps
}

/** Per-device encoder check via `scrcpy --list-encoders -s <serial>` (v4.1 supports it). */
export async function listDeviceEncoders(paths: RuntimePaths, serial: string): Promise<string> {
  return new Promise<string>((resolve) => {
    execFile(
      paths.scrcpyExe,
      ['--list-encoders', '-s', serial],
      { windowsHide: true, timeout: 20000 },
      (err, stdout, stderr) => {
        resolve(String(stdout || '') + (err && stderr ? `\n[stderr] ${stderr}` : ''))
      }
    )
  })
}
