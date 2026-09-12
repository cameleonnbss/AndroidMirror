import type { MirrorSettings, RecordingSettings, AdvancedSettings, SessionKind } from '@shared/types'

/**
 * Maps application settings to the exact CLI of the bundled scrcpy 4.1.
 * Only flags documented by `scrcpy --help` (v4.1) are emitted.
 */
export function buildScrcpyArgs(
  kind: SessionKind,
  serial: string,
  mirror: MirrorSettings,
  recording: RecordingSettings,
  advanced: AdvancedSettings,
  outputBase: string
): string[] {
  const args: string[] = ['-s', serial]
  // Audio-only recording records sound without any video stream.
  const videoOff = kind === 'audio-only' || (kind === 'recording' && recording.audioOnly)

  // ---- video -------------------------------------------------------------
  if (videoOff) {
    args.push('--no-video', '--no-video-playback')
  } else {
    // Stream-input mode can mirror the camera instead of the display (v4.1,
    // requires Android 12+; validated per-device via --list-encoders in the UI).
    if (kind === 'stream-input' && mirror.videoSource === 'camera') {
      args.push(`--video-source=camera`, `--camera-facing=${mirror.cameraFacing}`)
    } else {
      args.push('--video-source=display')
    }
    args.push('--video-codec=' + mirror.videoCodec)
    if (mirror.resolution !== 'native') {
      const px = parseInt(mirror.resolution, 10)
      if (Number.isFinite(px) && px > 0) args.push(`--max-size=${px}`)
    }
    if (mirror.fps !== 'auto') args.push(`--max-fps=${mirror.fps}`)
    args.push(`--video-bit-rate=${mirror.bitrateMbps}M`)
    if (mirror.orientation !== 'auto') {
      args.push(`--capture-orientation=${mirror.orientation}`)
    }
  }

  // ---- audio -------------------------------------------------------------
  if (!mirror.audioEnabled) {
    args.push('--no-audio')
  } else {
    args.push(`--audio-codec=${mirror.audioCodec}`)
    args.push(`--audio-bit-rate=${mirror.audioBitrateKbps}K`)
    if (mirror.audioSource !== 'output') {
      args.push(`--audio-source=${mirror.audioSource}`)
    }
  }

  // ---- recording ---------------------------------------------------------
  const wantRecord = kind === 'recording'
  if (wantRecord) {
    const fmt = recording.format
    args.push(`--record=${outputBase}.${fmt}`, `--record-format=${fmt}`)
  }

  // ---- input & window ----------------------------------------------------
  if (advanced.keyboard !== 'sdk') args.push(`--keyboard=${advanced.keyboard}`)
  if (advanced.mouse !== 'sdk') args.push(`--mouse=${advanced.mouse}`)
  if (advanced.gamepad !== 'disabled') args.push(`--gamepad=${advanced.gamepad}`)
  if (advanced.stayAwake) args.push('--stay-awake')
  if (advanced.turnScreenOff) args.push('--turn-screen-off')
  if (advanced.showTouches) args.push('--show-touches')
  if (advanced.keepActive) args.push('--keep-active')
  if (!advanced.clipboardAutosync) args.push('--no-clipboard-autosync')
  if (advanced.legacyPaste) args.push('--legacy-paste')
  if (!advanced.powerOn) args.push('--no-power-on')
  if (advanced.powerOffOnClose) args.push('--power-off-on-close')
  if (advanced.noCleanup) args.push('--no-cleanup')
  if (advanced.fullscreen) args.push('--fullscreen')
  if (advanced.alwaysOnTop) args.push('--always-on-top')
  if (advanced.windowBorderless) args.push('--window-borderless')
  if (advanced.forceAdbForward) args.push('--force-adb-forward')
  if (advanced.killAdbOnClose) args.push('--kill-adb-on-close')
  if (advanced.disableScreensaver) args.push('--disable-screensaver')

  if (advanced.verbosity !== 'info') args.push(`--verbosity=${advanced.verbosity}`)
  if (advanced.shortcutMod && advanced.shortcutMod !== 'lalt,lsuper') {
    args.push(`--shortcut-mod=${advanced.shortcutMod}`)
  }
  if (advanced.extraArgs.trim()) {
    args.push(...advanced.extraArgs.trim().split(/\s+/))
  }

  if (kind === 'audio-only') {
    // Hide the scrcpy window completely for audio-only sessions.
    args.push('--no-window')
  }

  if (kind === 'stream-input') {
    // Capture-ready window for OBS/vMix: no decorations, always on top,
    // disabled screensaver so the feed never hiccups.
    args.push('--window-borderless', '--always-on-top', '--disable-screensaver')
  }

  return args
}
