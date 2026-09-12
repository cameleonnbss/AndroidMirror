import { useApp } from '../store'
import { Badge, Button, SectionCard, formatElapsed, useToast } from '../components/ui'

export function HomePage(): React.JSX.Element {
  const { devices, sessions, adb, capabilities, settings, setPage, setPopup } = useApp()
  const toast = useToast()
  const online = devices.devices.filter((d) => d.state === 'device')

  const quickMirror = async (): Promise<void> => {
    const first = devices.candidates[0]
    if (!first) {
      toast('No authorized device connected', 'error')
      return
    }
    const r = await window.api.startMirror(first.serial)
    toast(r.message, r.ok ? 'success' : 'error')
  }

  return (
    <div className="page">
      <h1 className="page-title">Home</h1>
      <p className="page-sub">Mirror, control and record your Android devices — powered by scrcpy.</p>

      {!adb.ready && (
        <div className="banner error">
          <strong>ADB is not available.</strong> Device features are disabled.
          <Button className="small" style={{ marginLeft: 10 }} onClick={() => setPage('devices')}>
            Open Devices
          </Button>
        </div>
      )}

      <div className="grid-3">
        <SectionCard title="Devices">
          <div className="row" style={{ gap: 12 }}>
            <Badge color={online.length > 0 ? 'green' : 'gray'} pulse={online.length > 0}>
              {online.length} online
            </Badge>
            <Badge color="blue">{devices.devices.length} total</Badge>
          </div>
          <div className="hint">
            {online.length > 0
              ? online.map((d) => d.model || d.serial).join(', ')
              : 'Connect a phone via USB or Wi-Fi ADB.'}
          </div>
          <div style={{ marginTop: 12 }}>
            <Button className="small" onClick={() => setPage('devices')}>
              Manage devices
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Runtime">
          <table className="kv">
            <tbody>
              <tr>
                <td>scrcpy</td>
                <td className="mono">{capabilities?.scrcpyVersion || '…'}</td>
              </tr>
              <tr>
                <td>ADB</td>
                <td className="mono">{adb.ready ? (adb.version ?? 'ok') : 'unavailable'}</td>
              </tr>
              <tr>
                <td>Video codecs</td>
                <td className="mono">{capabilities?.videoCodecs.join(', ') ?? '…'}</td>
              </tr>
              <tr>
                <td>Audio codecs</td>
                <td className="mono">{capabilities?.audioCodecs.join(', ') ?? '…'}</td>
              </tr>
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title="Active sessions">
          {sessions.length === 0 ? (
            <div className="muted">No session running.</div>
          ) : (
            sessions.map((s) => (
              <div key={s.info.sessionId} className="session-chip">
                <Badge color="green" pulse>
                  {s.info.kind}
                </Badge>
                <span>{s.info.deviceName}</span>
                <span className="mono">{formatElapsed(s.elapsed)}</span>
                <span className="spacer" />
                <Button
                  className="small danger"
                  onClick={async () => {
                    await window.api.stopSession(s.info.sessionId)
                  }}
                >
                  Stop
                </Button>
              </div>
            ))
          )}
          <div style={{ marginTop: 10 }}>
            <Button
              className="small"
              onClick={async () => {
                await window.api.stopAllSessions()
              }}
              disabled={sessions.length === 0}
            >
              Stop all
            </Button>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Quick actions">
        <div className="row wrap">
          <Button className="primary" onClick={() => void quickMirror()} disabled={!adb.ready}>
            ▶ Start mirror (first device)
          </Button>
          <Button
            disabled={!adb.ready || online.length === 0}
            onClick={() => {
              const first = devices.candidates[0]
              if (!first) return
              setPopup({
                serial: first.serial,
                name: first.name,
                profileId: first.profileId,
                profileName: first.profileName,
                autoStart: first.autoStart
              })
              setPage('mirror')
            }}
          >
            Choose a device
          </Button>
          <Button onClick={() => setPage('recording')}>Recording</Button>
          <Button onClick={() => setPage('gaming')}>Gaming Mode</Button>
        </div>
        <div className="hint">
          Shortcuts: {settings?.global.globalShortcuts['toggle-mirror'] ?? 'F8'} mirror ·{' '}
          {settings?.global.globalShortcuts['toggle-recording'] ?? 'F9'} recording ·{' '}
          {settings?.global.globalShortcuts['gaming-mode'] ?? 'F10'} gaming — configure them in
          Settings.
        </div>
      </SectionCard>
    </div>
  )
}
