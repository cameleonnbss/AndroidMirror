import { useEffect } from 'react'
import { useApp } from './store'
import { ToastHost, Button } from './components/ui'
import { HomePage } from './pages/HomePage'
import { DevicesPage } from './pages/DevicesPage'
import { MirrorPage } from './pages/MirrorPage'
import { RecordingPage } from './pages/RecordingPage'
import { GamingPage } from './pages/GamingPage'
import { ProfilesPage } from './pages/ProfilesPage'
import { SettingsPage } from './pages/SettingsPage'
import { LogsPage } from './pages/LogsPage'

const NAV: Array<{ id: string; label: string; icon: string }> = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'devices', label: 'Devices', icon: '📱' },
  { id: 'mirror', label: 'Mirror', icon: '🖥' },
  { id: 'recording', label: 'Recording', icon: '⏺' },
  { id: 'gaming', label: 'Gaming Mode', icon: '🎮' },
  { id: 'profiles', label: 'Profiles', icon: 'UserProfile' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'logs', label: 'Logs', icon: '☰' }
]

function RecognizedPopup(): React.JSX.Element | null {
  const { popup, setPopup } = useApp()
  if (!popup) return null
  const close = (): void => setPopup(null)

  const launch = async (profileId: string | null): Promise<void> => {
    if (profileId) {
      const r = await window.api.launchProfile(profileId, popup.serial)
      if (!r.ok) console.warn(r.message)
    } else {
      await window.api.startMirror(popup.serial)
    }
    close()
  }

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Phone recognized</h2>
        <p className="modal-sub">
          {popup.name} <span className="mono">({popup.serial})</span> is connected.
        </p>
        {popup.profileName ? (
          <>
            <div className="banner info">
              Profile found: <strong>{popup.profileName}</strong>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={popup.autoStart}
                onChange={async (e) => {
                  await window.api.setAutoStart(popup.serial, e.target.checked)
                  setPopup({ ...popup, autoStart: e.target.checked })
                }}
              />
              Launch this profile automatically next time
            </label>
          </>
        ) : (
          <div className="banner info">
            No profile is bound to this device yet — create one in <strong>Profiles</strong>.
          </div>
        )}
        <div className="modal-actions">
          {popup.profileName && (
            <Button className="primary" onClick={() => void launch(popup.profileId)}>
              Launch {popup.profileName}
            </Button>
          )}
          <Button
            onClick={() => {
              useApp.getState().setPage('profiles')
              close()
            }}
          >
            Choose another profile
          </Button>
          <Button onClick={close}>Do nothing</Button>
        </div>
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const { loaded, page, setPage, adb, sessions, init } = useApp()

  useEffect(() => {
    // Guard for React 18/19 dev-mode double-invoked effects (StrictMode-like).
    void init().catch((err) => console.error('init failed', err))
  }, [init])

  // In-app F-key shortcuts (global ones are registered in the main process).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      const s = useApp.getState().settings?.global.globalShortcuts
      if (!s) return
      const key = e.key
      const st = useApp.getState()
      if (key === s['toggle-mirror']) {
        const m = st.sessions.filter((x) => x.info.kind === 'mirror')
        if (m.length > 0) void window.api.stopAllSessions()
        else {
          const serial = st.devices.candidates[0]?.serial
          if (serial) void window.api.startMirror(serial)
        }
      } else if (key === s['toggle-recording']) {
        const rec = st.sessions.find((x) => x.info.kind === 'recording')
        if (rec) void window.api.stopSession(rec.info.sessionId)
        else {
          const serial = st.devices.candidates[0]?.serial
          if (serial) void window.api.startRecording(serial)
        }
      } else if (key === s['gaming-mode']) {
        st.setPage('gaming')
      } else if (key === s['show-app']) {
        st.setPage('home')
      } else if (key === s['refresh-devices']) {
        void st.refresh()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!loaded) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>Loading…</div>
  }

  return (
    <ToastHost>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-logo">A</div>
            <div>
              <div className="brand-name">AndroidMirror</div>
              <span className="brand-sub">scrcpy GUI</span>
            </div>
          </div>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? 'active' : ''}`}
              onClick={() => setPage(n.id)}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
          <div className="sidebar-footer">
            <div>
              ADB: {adb.ready ? <span className="ok">ready</span> : <span className="ko">offline</span>}
            </div>
            <div>sessions: {sessions.length}</div>
          </div>
        </aside>

        <main className="main">
          {page === 'home' && <HomePage />}
          {page === 'devices' && <DevicesPage />}
          {page === 'mirror' && <MirrorPage />}
          {page === 'recording' && <RecordingPage />}
          {page === 'gaming' && <GamingPage />}
          {page === 'profiles' && <ProfilesPage />}
          {page === 'settings' && <SettingsPage />}
          {page === 'logs' && <LogsPage />}
        </main>
      </div>
      <RecognizedPopup />
    </ToastHost>
  )
}
