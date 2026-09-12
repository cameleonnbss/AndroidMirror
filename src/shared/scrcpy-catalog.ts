/**
 * Capability catalog extracted from the bundled scrcpy binary.
 * Everything here reflects scrcpy 4.1 (SDL 3.4.12, libavcodec 62.28.102) —
 * the exact version shipped in resources/scrcpy. Do not assume options that
 * the bundled build does not support.
 */

import type { GamingPresetId, MirrorSettings } from './types'
import { DEFAULT_MIRROR } from './types'

/** Resolution ladder (scrcpy -m / --max-size). */
export const RESOLUTION_OPTIONS: Array<{ value: string; label: string; px: number }> = [
  { value: 'native', label: 'Native', px: 0 },
  { value: '2560', label: '2560p', px: 2560 },
  { value: '1920', label: '1920p', px: 1920 },
  { value: '1600', label: '1600p', px: 1600 },
  { value: '1280', label: '1280p', px: 1280 },
  { value: '1024', label: '1024p', px: 1024 },
  { value: '800', label: '800p', px: 800 }
]

export const FPS_OPTIONS: Array<{ value: 'auto' | number; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 30, label: '30 FPS' },
  { value: 60, label: '60 FPS' },
  { value: 90, label: '90 FPS' },
  { value: 120, label: '120 FPS' }
]

export const BITRATE_PRESETS_MBPS = [8, 16, 25, 50, 100]

export const VIDEO_CODECS = [
  { value: 'h264', label: 'H.264 (AVC)' },
  { value: 'h265', label: 'H.265 (HEVC)' },
  { value: 'av1', label: 'AV1' },
  { value: 'vp8', label: 'VP8' },
  { value: 'vp9', label: 'VP9' }
] as const

export const AUDIO_CODECS = ['opus', 'aac', 'flac', 'raw'] as const

export const AUDIO_SOURCES = [
  { value: 'output', label: 'Output (media)' },
  { value: 'playback', label: 'Playback capture' },
  { value: 'mic', label: 'Microphone' },
  { value: 'voice-call', label: 'Voice call' },
  { value: 'voice-performance', label: 'Voice performance' }
] as const

/** scrcpy 4.1 --record-format values. */
export const RECORD_FORMATS = ['mp4', 'mkv', 'm4a', 'mka', 'opus', 'aac', 'flac', 'wav'] as const

export function isAudioOnlyFormat(format: string): boolean {
  return ['m4a', 'mka', 'opus', 'aac', 'flac', 'wav'].includes(format)
}

const base: MirrorSettings = { ...DEFAULT_MIRROR }

export const GAMING_PRESETS: Record<
  GamingPresetId,
  { label: string; description: string; mirror: MirrorSettings }
> = {
  'low-latency': {
    label: 'Low Latency',
    description: 'Minimum end-to-end latency. Reduced resolution, high bitrate to keep quality.',
    mirror: {
      ...base,
      resolution: '1280',
      fps: 120,
      bitrateMbps: 50,
      videoCodec: 'h264',
      audioEnabled: true,
      audioCodec: 'opus',
      audioBitrateKbps: 128,
      orientation: 'auto'
    }
  },
  balanced: {
    label: 'Balanced',
    description: 'Good quality with moderate bandwidth and battery usage.',
    mirror: {
      ...base,
      resolution: '1920',
      fps: 60,
      bitrateMbps: 50,
      videoCodec: 'h265',
      audioEnabled: true,
      audioCodec: 'opus',
      audioBitrateKbps: 128,
      orientation: 'auto'
    }
  },
  'high-quality': {
    label: 'High Quality',
    description: 'Maximum image quality. Requires a strong USB connection or Wi-Fi.',
    mirror: {
      ...base,
      resolution: 'native',
      fps: 120,
      bitrateMbps: 100,
      videoCodec: 'h265',
      audioEnabled: true,
      audioCodec: 'opus',
      audioBitrateKbps: 192,
      orientation: 'auto'
    }
  },
  custom: {
    label: 'Custom',
    description: 'Your own tuning, editable below.',
    mirror: { ...base }
  }
}
