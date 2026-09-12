import { useState } from 'react'
import { useApp } from '../store'
import { Badge, Button, SectionCard, formatElapsed, useToast } from '../components/ui'
import { MirrorSettingsPanel } from '../components/MirrorSettingsPanel'
import { RECORD_FORMATS, isAudioOnlyFormat } from '@shared/scrcpy-catalog'
import type { RecordingSettings, MirrorSettings } from '@renderer/renderer-types'

export function RecordingPage(): React.JSX.Element {
  const { settings, devices, sessions } = useApp()
  const toast = useToast()
  const [serial, setSerial] = useState('')
  const g = settings?.global
  const online = devices.devices.filter((d) => d.state === 'device')
  const effectiveSerial = serial || online[0]?.serial || ''

  if (!g) return <div className="page" />

  const recSession = sessions.find(
    (s) => s.info.kind === 'recording' && (!effectiveSerial || s.info.serial === effectiveSerial)
  )

  const patchRecording = async (patch: Partial<RecordingSettings>): Promise<void> => {
    await window.api.saveGlobal({ recording: { ...g.recording, ...patch } })
  }

  const startRec = async (): Promise<void> => {
    if (!effectiveSerial) {
      toast('No device connected', 'error')
      return
    }
    const r = await window.api.startRecording(effectiveSerial)
    toast(r.message, r.ok ? 'success' : 'error')
  }

  return (
    <div className="page">
      <h1 className="page-title">Recording</h1>
      <p className="page-sub">
        Record the screen, the audio, or both — powered by scrcpy’s built-in recorder (mp4 / mkv /
        wav / opus / aac / flac).
      </p>

      {recSession && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <div className="row" style={{ gap: 14 }}>
            <Badge color="red" pulse>● REC</Badge>
            <span className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
              {formatElapsed(recSession.elapsed)}
            </span>
            <span className="muted">
              {recSession.info.deviceName} ({recSession.info.serial})
            </span>
            <span className="spacer" />
            <Button
              className="danger"
              onClick={async () => {
                await window.api.stopSession(recSession.info.sessionId)
                toast('Recording stopped — file saved', 'success')
              }}
            >
              ■ Stop recording
            </Button>
          </div>
          {recSession.info.recordingPath && (
            <div className="hint mono">→ {recSession.info.recordingPath}</div>
          )}
        </div>
      )}

      <div className="grid-2">
        <SectionCard title="Target device">
          <select value={effectiveSerial} onChange={(e) => setSerial(e.target.value)}>
            <option value="" disabled>
              {online.length === 0 ? 'No device connected' : 'Select device…'}
            </option>
            {online.map((d) => (
              <option key={d.serial} value={d.serial}>
                {d.brand || d.manufacturer} {d.model} — {d.serial}
              </option>
            ))}
          </select>
          <div className="hint">Recordings are timestamped automatically.</div>
        </SectionCard>

        <SectionCard title="Output">
          <div className="row">
            <input type="text" className="mono" readOnly value={g.recording.directory || '(default: app data / recordings)'} style={{ flex: 1 }} />
            <Button
              className="small"
              onClick={async () => {
                const dir = await window.api.pickDirectory(g.recording.directory || undefined)
                if (dir) await patchRecording({ directory: dir })
              }}
            >
              Choose…
            </Button>
            <Button className="small ghost" onClick={() => void window.api.openPath('recordings')}>
              Open
            </Button>
          </div>
          <div style={{ height: 10 }} />
          <label className="field">
            <span className="lab">Format</span>
            <select
              value={g.recording.format}
              onChange={(e) => {
                const fmt = e.target.value as RecordingSettings['format']
                void patchRecording({
                  format: fmt,
                  // video containers require video; audio containers imply audio-only capture
                  ...(isAudioOnlyFormat(fmt) ? { audioOnly: true } : {})
                })
              }}
            >
              {RECORD_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                  {isAudioOnlyFormat(f) ? ' — audio only' : ' — video' + (g.recording.recordAudio ? ' + audio' : '')}
                </option>
              ))}
            </select>
          </label>
        </SectionCard>
      </div>

      {isAudioOnlyFormat(g.recording.format) ? (
        <SectionCard title="Audio-only recording">
          <div className="banner info">
            Audio-only mode records the device sound with no video stream
            (<span className="mono">--no-video</span>). Codec: <span className="mono">{g.mirror.audioCodec}</span>,
            source: <span className="mono">{g.mirror.audioSource}</span>.
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Video settings for recording">
          <MirrorSettingsPanel
            value={g.mirror}
            onChange={(m: MirrorSettings) => {
              void window.api.saveGlobal({ mirror: m })
            }}
          />
        </SectionCard>
      )}

      <SectionCard title="Control">
        <div className="row">
          <Button className="primary" onClick={() => void startRec()} disabled={!effectiveSerial || !!recSession}>
            ● Start recording
          </Button>
          {recSession && (
            <Button className="danger" onClick={() => void window.api.stopSession(recSession.info.sessionId)}>
              ■ Stop
            </Button>
          )}
          <span className="hint" style={{ marginLeft: 10 }}>
            Global hotkey:{' '}
            <span className="mono">{settings?.global.globalShortcuts['toggle-recording'] ?? 'F9'}</span>{' '}
            starts/stops on the first connected device.
          </span>
        </div>
      </SectionCard>
    </div>
  )
}
