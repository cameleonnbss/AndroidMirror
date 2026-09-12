import type { MirrorSettings } from '@renderer/renderer-types'
import {
  RESOLUTION_OPTIONS,
  FPS_OPTIONS,
  BITRATE_PRESETS_MBPS,
  VIDEO_CODECS,
  AUDIO_CODECS,
  AUDIO_SOURCES
} from '@shared/scrcpy-catalog'
import { Field, Select, Check } from './ui'
import React from 'react'

export function MirrorSettingsPanel(props: {
  value: MirrorSettings
  onChange: (next: MirrorSettings) => void
  videoCodecs?: string[]
  showAudio?: boolean
}): React.JSX.Element {
  const v = props.value
  const set = (patch: Partial<MirrorSettings>): void => {
    props.onChange({ ...v, ...patch })
  }

  const isPresetBitrate = BITRATE_PRESETS_MBPS.includes(v.bitrateMbps)
  const codecList = props.videoCodecs ?? VIDEO_CODECS.map((c) => c.value)
  const codecs = VIDEO_CODECS.filter((c) => codecList.includes(c.value))

  return (
    <div>
      <div className="grid-2">
        <Field label="Resolution">
          <Select
            value={RESOLUTION_OPTIONS.some((r) => r.value === v.resolution) ? v.resolution : 'custom'}
            onChange={(e) => {
              const val = e.target.value
              if (val === 'custom') {
                const custom = window.prompt('Custom max size (px, e.g. 1440):', v.resolution === 'native' ? '1440' : v.resolution)
                if (custom && /^\d+$/.test(custom)) set({ resolution: custom })
                return
              }
              set({ resolution: val })
            }}
          >
            {RESOLUTION_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
            {!RESOLUTION_OPTIONS.some((r) => r.value === v.resolution) && (
              <option value="custom">{`${v.resolution}p (custom)`}</option>
            )}
          </Select>
        </Field>

        <Field label="Frame rate">
          <Select
            value={String(v.fps)}
            onChange={(e) => {
              const val = e.target.value
              if (val === 'custom') {
                const custom = window.prompt('Custom max FPS:', '90')
                if (custom && /^\d+$/.test(custom)) set({ fps: parseInt(custom, 10) })
                return
              }
              set({ fps: val === 'auto' ? 'auto' : parseInt(val, 10) })
            }}
          >
            {FPS_OPTIONS.map((f) => (
              <option key={String(f.value)} value={String(f.value)}>
                {f.label}
              </option>
            ))}
            {typeof v.fps === 'number' && !FPS_OPTIONS.some((f) => f.value === v.fps) && (
              <option value={String(v.fps)}>{`${v.fps} FPS (custom)`}</option>
            )}
            <option value="custom">Custom…</option>
          </Select>
        </Field>
      </div>

      <div className="grid-2">
        <Field label="Bitrate">
          <Select
            value={isPresetBitrate ? String(v.bitrateMbps) : 'custom'}
            onChange={(e) => {
              const val = e.target.value
              if (val === 'custom') {
                const custom = window.prompt('Bitrate in Mbps:', String(v.bitrateMbps))
                if (custom && /^\d+(\.\d+)?$/.test(custom)) set({ bitrateMbps: parseFloat(custom) })
                return
              }
              set({ bitrateMbps: parseInt(val, 10) })
            }}
          >
            {BITRATE_PRESETS_MBPS.map((b) => (
              <option key={b} value={String(b)}>
                {b} Mbps
              </option>
            ))}
            {!isPresetBitrate && <option value="custom">{`${v.bitrateMbps} Mbps (custom)`}</option>}
            <option value="custom">Custom…</option>
          </Select>
        </Field>

        <Field label="Video codec">
          <Select value={v.videoCodec} onChange={(e) => set({ videoCodec: e.target.value as MirrorSettings['videoCodec'] })}>
            {codecs.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid-2">
        <Field label="Video source">
          <Select
            value={v.videoSource ?? 'display'}
            onChange={(e) => set({ videoSource: e.target.value as MirrorSettings['videoSource'] })}
          >
            <option value="display">Screen (display)</option>
            <option value="camera">Camera (Android 12+, for OBS)</option>
          </Select>
        </Field>
        {v.videoSource === 'camera' && (
          <Field label="Camera">
            <Select
              value={v.cameraFacing ?? 'back'}
              onChange={(e) => set({ cameraFacing: e.target.value as MirrorSettings['cameraFacing'] })}
            >
              <option value="back">Back camera</option>
              <option value="front">Front camera</option>
              <option value="external">External</option>
            </Select>
          </Field>
        )}
      </div>

      <Field label="Orientation (capture)">
        <Select value={v.orientation} onChange={(e) => set({ orientation: e.target.value as MirrorSettings['orientation'] })}>
          <option value="auto">Automatic</option>
          <option value="0">0° — portrait lock</option>
          <option value="90">90°</option>
          <option value="180">180°</option>
          <option value="270">270°</option>
        </Select>
      </Field>

      {props.showAudio !== false && (
        <>
          <hr className="hr" />
          <h3 style={{ margin: '0 0 10px', fontSize: 13.5 }}>Audio</h3>
          <div className="grid-2">
            <div>
              <Check checked={v.audioEnabled} onChange={(b) => set({ audioEnabled: b })} label="Audio enabled" />
              <Field label="Audio source">
                <Select
                  value={v.audioSource}
                  onChange={(e) => set({ audioSource: e.target.value as MirrorSettings['audioSource'] })}
                >
                  {AUDIO_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div>
              <Field label="Audio codec">
                <Select
                  value={v.audioCodec}
                  onChange={(e) => set({ audioCodec: e.target.value as MirrorSettings['audioCodec'] })}
                >
                  {AUDIO_CODECS.map((c) => (
                    <option key={c} value={c}>
                      {c.toUpperCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Audio bitrate (kbps)">
                <Select
                  value={String(v.audioBitrateKbps)}
                  onChange={(e) => set({ audioBitrateKbps: parseInt(e.target.value, 10) })}
                >
                  {[64, 96, 128, 160, 192, 256, 320].map((k) => (
                    <option key={k} value={String(k)}>
                      {k} kbps
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
