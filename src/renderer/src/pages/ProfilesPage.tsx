import { useState } from 'react'
import type { JSX } from 'react'
import { useApp } from '../store'
import { Badge, Button, useToast } from '../components/ui'
import { MirrorSettingsPanel } from '../components/MirrorSettingsPanel'
import { RECORD_FORMATS } from '@shared/scrcpy-catalog'
import type { Profile, RecordingSettings, MirrorSettings } from '@renderer/renderer-types'

function makeNewProfile(advancedSrc: Profile['advanced']): Profile {
  return {
    id: `profile-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: 'New profile',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    boundSerial: null,
    mirror: {
      resolution: 'native',
      fps: 'auto',
      bitrateMbps: 8,
      videoCodec: 'h264',
      audioCodec: 'opus',
      audioEnabled: true,
      audioSource: 'output',
      audioBitrateKbps: 128,
      orientation: 'auto',
      maxFpsLock: false,
      videoSource: 'display',
      cameraFacing: 'back'
    },
    recording: {
      enabled: false,
      format: 'mp4',
      directory: '',
      recordAudio: true,
      audioOnly: false,
      fixTimestampedName: true
    },
    advanced: advancedSrc
  }
}

export function ProfilesPage(): JSX.Element {
  const { settings, devices } = useApp()
  const toast = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)

  if (!settings) return <div className="page" />
  const profiles = settings.profiles
  const online = devices.devices.filter((d) => d.state === 'device')

  const persist = async (p: Profile): Promise<void> => {
    await window.api.saveProfile({ ...p, updatedAt: Date.now() })
    toast(`Profile "${p.name}" saved`, 'success')
  }

  return (
    <div className="page">
      <h1 className="page-title">Profiles</h1>
      <p className="page-sub">
        Named configurations you can bind to a specific phone. Matching profiles are offered
        automatically when the device is detected.
      </p>

      <div className="row" style={{ marginBottom: 14 }}>
        <Button
          className="primary small"
          onClick={async () => {
            const p = makeNewProfile(settings.global.advanced)
            await persist(p)
            setEditingId(p.id)
          }}
        >
          + New profile
        </Button>
      </div>

      {profiles.length === 0 ? (
        <div className="card">
          <div className="muted">
            No profile yet — create one to save a full scrcpy configuration (resolution, FPS,
            bitrate, codec, audio, recording, keyboard/mouse options…).
          </div>
        </div>
      ) : (
        profiles.map((p) => (
          <div key={p.id} className="device-card" style={{ marginBottom: 12 }}>
            <div className="device-head">
              <div className="brand-logo">{p.name.slice(0, 1).toUpperCase()}</div>
              <div>
                <div className="device-name">{p.name}</div>
                <div className="device-serial">
                  {p.boundSerial ? `bound to ${p.boundSerial}` : 'not bound to a device'}
                </div>
              </div>
              <span className="spacer" />
              <Badge color={p.recording.enabled ? 'purple' : 'blue'}>
                {p.recording.enabled ? 'recording' : 'mirror'}
              </Badge>
            </div>

            <div className="preset-specs">
              <div>
                {p.mirror.resolution === 'native' ? 'native' : `${p.mirror.resolution}p`} ·{' '}
                {p.mirror.fps === 'auto' ? 'auto FPS' : `${p.mirror.fps} FPS`} ·{' '}
                {p.mirror.bitrateMbps} Mbps · {p.mirror.videoCodec.toUpperCase()} ·{' '}
                {p.mirror.audioEnabled ? `audio ${p.mirror.audioCodec}` : 'no audio'}
              </div>
            </div>

            <div className="row wrap" style={{ marginTop: 12 }}>
              <Button
                className="small primary"
                disabled={online.length === 0}
                onClick={async () => {
                  const target = p.boundSerial && online.some((d) => d.serial === p.boundSerial)
                    ? p.boundSerial
                    : online[0]?.serial
                  if (!target) return
                  const r = await window.api.launchProfile(p.id, target)
                  toast(r.message, r.ok ? 'success' : 'error')
                }}
              >
                ▶ Launch
              </Button>
              <Button className="small" onClick={() => setEditingId(p.id)}>
                Edit
              </Button>
              <Button
                className="small"
                onClick={async () => {
                  await window.api.duplicateProfile(p.id)
                  toast('Profile duplicated', 'success')
                }}
              >
                Duplicate
              </Button>
              <span className="spacer" />
              <select
                value={p.boundSerial ?? ''}
                onChange={async (e) => {
                  await window.api.bindProfileToSerial(p.id, e.target.value || null)
                  toast('Binding updated', 'success')
                }}
                style={{ maxWidth: 210 }}
              >
                <option value="">bind to device…</option>
                {settings.knownDevices.map((k) => (
                  <option key={k.serial} value={k.serial}>
                    {k.name || k.serial}
                  </option>
                ))}
              </select>
              <Button
                className="small danger"
                onClick={async () => {
                  await window.api.deleteProfile(p.id)
                  toast('Profile deleted', 'success')
                }}
              >
                Delete
              </Button>
            </div>

            {editingId === p.id && (
              <ProfileEditor
                profile={p}
                onClose={() => setEditingId(null)}
              />
            )}
          </div>
        ))
      )}
    </div>
  )
}

function ProfileEditor(props: { profile: Profile; onClose: () => void }): JSX.Element {
  const { settings } = useApp()
  const { profile, onClose } = props
  const [draft, setDraft] = useState<Profile>(() => ({
    ...profile,
    advanced: profile.advanced ?? settings!.global.advanced,
    recording: profile.recording ?? settings!.global.recording
  }))

  const patchMirror = (m: MirrorSettings): void => setDraft({ ...draft, mirror: m })
  const patchRecording = (patch: Partial<RecordingSettings>): void =>
    setDraft({ ...draft, recording: { ...draft.recording, ...patch } })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 'min(780px, 94vw)', maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h2>Edit profile</h2>
        <div className="row" style={{ margin: '10px 0 16px' }}>
          <input
            type="text"
            value={draft.name}
            style={{ flex: 1 }}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <Button
            className="primary"
            onClick={async () => {
              await window.api.saveProfile({ ...draft, updatedAt: Date.now() })
              onClose()
            }}
          >
            Save profile
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>

        <MirrorSettingsPanel value={draft.mirror} onChange={patchMirror} />

        <hr className="hr" />
        <h3 style={{ margin: '0 0 10px', fontSize: 13.5 }}>Recording</h3>
        <div className="grid-2">
          <div>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.recording.enabled && !draft.recording.audioOnly}
                onChange={(e) => patchRecording({ enabled: e.target.checked, audioOnly: false })}
              />
              Record screen while mirroring
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.recording.audioOnly}
                onChange={(e) => patchRecording({ audioOnly: e.target.checked, enabled: true })}
              />
              Audio-only recording (no video)
            </label>
          </div>
          <div>
            <label className="field">
              <span className="lab">Format</span>
              <select
                value={draft.recording.format}
                onChange={(e) => patchRecording({ format: e.target.value as RecordingSettings['format'] })}
              >
                {RECORD_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
