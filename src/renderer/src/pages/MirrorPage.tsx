import { useState } from 'react'
import { useApp } from '../store'
import { Badge, Button, SectionCard, useToast } from '../components/ui'
import { MirrorSettingsPanel } from '../components/MirrorSettingsPanel'
import type { MirrorSettings } from '@renderer/renderer-types'

export function MirrorPage(): React.JSX.Element {
  const { settings, devices, sessions } = useApp()
  const toast = useToast()
  const [serial, setSerial] = useState<string>('')
  const g = settings?.global

  const online = devices.devices.filter((d) => d.state === 'device')
  const effectiveSerial = serial || online[0]?.serial || ''

  if (!g || !effectiveSerial) {
    return (
      <div className="page">
        <h1 className="page-title">Mirror</h1>
        <p className="page-sub">Configure and launch a mirror session.</p>
        <div className="banner warn">
          No authorized device connected. Connect a phone first, then come back here.
        </div>
      </div>
    )
  }

  const runningForDevice = sessions.some((s) => s.info.serial === effectiveSerial)

  const start = async (kind: 'mirror' | 'audio-only' | 'stream-input'): Promise<void> => {
    const r =
      kind === 'mirror'
        ? await window.api.startMirror(effectiveSerial)
        : kind === 'audio-only'
          ? await window.api.startAudioOnly(effectiveSerial)
          : await window.api.startStreamInput(effectiveSerial)
    toast(r.message, r.ok ? 'success' : 'error')
  }

  const saveMirror = async (next: MirrorSettings): Promise<void> => {
    await window.api.saveGlobal({ mirror: next })
  }

  return (
    <div className="page">
      <h1 className="page-title">Mirror</h1>
      <p className="page-sub">Launch scrcpy with the settings below — no terminal needed.</p>

      <SectionCard
        title="Target device"
        right={
          <Badge color={online.length > 1 ? 'blue' : 'gray'}>
            {online.length} available
          </Badge>
        }
      >
        <div className="row">
          <select
            value={effectiveSerial}
            onChange={(e) => setSerial(e.target.value)}
            style={{ maxWidth: 340 }}
          >
            {online.map((d) => (
              <option key={d.serial} value={d.serial}>
                {d.brand || d.manufacturer} {d.model} — {d.serial}
              </option>
            ))}
          </select>
          {runningForDevice && <Badge color="green" pulse>session running</Badge>}
        </div>
      </SectionCard>

      <SectionCard title="Mirror settings">
        <MirrorSettingsPanel value={g.mirror} onChange={(m) => void saveMirror(m)} />
        <div className="hint">
          Settings apply on the next launch and are persisted automatically.
        </div>
      </SectionCard>

      <SectionCard title="Launch">
        <div className="row wrap">
          <Button className="primary" onClick={() => void start('mirror')} disabled={runningForDevice}>
            ▶ Start mirror
          </Button>
          <Button onClick={() => void start('audio-only')} disabled={runningForDevice}>
            ♪ Audio only (no video)
          </Button>
          <Button onClick={() => void start('stream-input')} disabled={runningForDevice}>
            📹 Stream input (OBS capture)
          </Button>
          {runningForDevice && (
            <Button
              className="danger"
              onClick={async () => {
                const s = sessions.find((x) => x.info.serial === effectiveSerial)
                if (s) await window.api.stopSession(s.info.sessionId)
              }}
            >
              ■ Stop session
            </Button>
          )}
        </div>
        <div className="hint">
          Audio-only runs scrcpy with <span className="mono">--no-video --no-window</span>; Android
          11+ required for audio forwarding. Stream input opens a borderless always-on-top window
          you can capture in OBS/vMix — pick “Camera” as video source above to use the phone camera
          as a webcam (Android 12+).
        </div>
      </SectionCard>
    </div>
  )
}
