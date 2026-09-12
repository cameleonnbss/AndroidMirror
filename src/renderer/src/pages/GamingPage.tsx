import { useState } from 'react'
import { useApp } from '../store'
import { Badge, Button, SectionCard, useToast } from '../components/ui'
import { MirrorSettingsPanel } from '../components/MirrorSettingsPanel'
import { GAMING_PRESETS } from '@shared/scrcpy-catalog'
import type { GamingPresetId, MirrorSettings } from '@renderer/renderer-types'

export function GamingPage(): React.JSX.Element {
  const { settings, devices, sessions } = useApp()
  const toast = useToast()
  const [serial, setSerial] = useState('')
  const g = settings?.global
  const online = devices.devices.filter((d) => d.state === 'device')
  const effectiveSerial = serial || online[0]?.serial || ''

  if (!g) return <div className="page" />

  const gaming = g.gaming
  const activePreset = gaming.preset

  const selectPreset = async (id: GamingPresetId): Promise<void> => {
    await window.api.setGamingPreset(id)
    await window.api.refreshDevices()
  }

  const launchGaming = async (): Promise<void> => {
    if (!effectiveSerial) {
      toast('No device connected', 'error')
      return
    }
    const mirror =
      activePreset === 'custom' ? gaming.custom : GAMING_PRESETS[activePreset].mirror
    const r = await window.api.startMirror(effectiveSerial, mirror)
    toast(r.message, r.ok ? 'success' : 'error')
  }

  const specs = (m: MirrorSettings): string[] => [
    `Resolution : ${m.resolution === 'native' ? 'native' : `${m.resolution}p`}`,
    `FPS        : ${m.fps === 'auto' ? 'auto' : m.fps}`,
    `Bitrate    : ${m.bitrateMbps} Mbps`,
    `Codec      : ${m.videoCodec.toUpperCase()}`,
    `Audio      : ${m.audioEnabled ? `${m.audioCodec} ${m.audioBitrateKbps}k` : 'off'}`
  ]

  return (
    <div className="page">
      <h1 className="page-title">Gaming Mode</h1>
      <p className="page-sub">
        Latency-first scrcpy tuning. This configures the stream only — it does not pretend to change
        the phone’s internal performance settings.
      </p>

      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {(Object.keys(GAMING_PRESETS) as GamingPresetId[]).map((id) => {
          const p = GAMING_PRESETS[id]
          return (
            <div
              key={id}
              className={`preset-card ${activePreset === id ? 'selected' : ''}`}
              onClick={() => void selectPreset(id)}
            >
              <div className="preset-title">
                {activePreset === id ? <Badge color="blue">active</Badge> : null}
                {p.label}
              </div>
              <div className="preset-desc">{p.description}</div>
              <div className="preset-specs">
                {specs(p.mirror).map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {activePreset === 'custom' && (
        <SectionCard title="Custom gaming tuning">
          <MirrorSettingsPanel
            value={gaming.custom}
            onChange={(m) => void window.api.saveGamingCustom(m)}
          />
        </SectionCard>
      )}

      <SectionCard title="Launch Gaming Mode">
        <div className="row wrap">
          <select value={effectiveSerial} onChange={(e) => setSerial(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="" disabled>
              {online.length === 0 ? 'No device connected' : 'Select device…'}
            </option>
            {online.map((d) => (
              <option key={d.serial} value={d.serial}>
                {d.brand || d.manufacturer} {d.model} — {d.serial}
              </option>
            ))}
          </select>
          <Button className="primary" onClick={() => void launchGaming()} disabled={!effectiveSerial}>
            🎮 Launch Gaming Mode
          </Button>
          <span className="hint">
            Hotkey:{' '}
            <span className="mono">{settings?.global.globalShortcuts['gaming-mode'] ?? 'F10'}</span>
          </span>
        </div>
        {sessions.length > 0 && (
          <div className="hint">
            Running: {sessions.map((s) => `${s.info.kind} on ${s.info.deviceName}`).join(' · ')}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
