import { useState } from 'react'
import { useApp } from '../store'
import { Badge, Button, SectionCard, Stat, useToast } from '../components/ui'
import type { DeviceInfo } from '@renderer/renderer-types'

function stateBadge(state: DeviceInfo['state']): React.JSX.Element {
  switch (state) {
    case 'device':
      return <Badge color="green" pulse>Connected</Badge>
    case 'unauthorized':
      return <Badge color="amber">Unauthorized</Badge>
    case 'offline':
      return <Badge color="red">Offline</Badge>
    case 'connecting':
      return <Badge color="blue">Connecting</Badge>
    default:
      return <Badge color="gray">Unknown</Badge>
  }
}

function DeviceCard(props: { d: DeviceInfo }): React.JSX.Element {
  const d = props.d
  const toast = useToast()
  const { setPage } = useApp()

  const doWifi = async (): Promise<void> => {
    const ip = window.prompt('Device IP:port for ADB over Wi-Fi (e.g. 192.168.1.42:5555):', '')
    if (!ip) return
    const r = await window.api.connectWifi(d.serial, ip)
    toast(r.message, r.ok ? 'success' : 'error')
  }

  return (
    <div className="device-card">
      <div className="device-head">
        <div className="brand-logo">{(d.model || d.serial).slice(0, 1).toUpperCase()}</div>
        <div>
          <div className="device-name">
            {d.brand || d.manufacturer || 'Android'} {d.model || d.serial}
          </div>
          <div className="device-serial">{d.serial} · {d.kind.toUpperCase()}</div>
        </div>
        <span className="spacer" />
        {stateBadge(d.state)}
      </div>

      <div className="device-stats">
        <Stat k="Android" v={d.androidVersion ? `${d.androidVersion} (API ${d.apiLevel})` : ''} />
        <Stat k="Resolution" v={d.resolution} />
        <Stat k="Refresh rate" v={d.refreshRate} />
        <Stat k="Battery" v={d.batteryLevel} />
        <Stat k="Battery temp" v={d.batteryTemp} />
        <Stat k="Battery health" v={d.batteryHealth} />
        <Stat k="Storage" v={d.storageUsed && d.storageTotal ? `${d.storageUsed} / ${d.storageTotal}` : ''} />
      </div>

      {d.state === 'unauthorized' && (
        <div className="banner warn">
          Unlock the phone and accept the <strong>“Allow USB debugging”</strong> prompt, then
          refresh.
        </div>
      )}

      <div className="row wrap">
        <Button
          className="primary small"
          disabled={d.state !== 'device'}
          onClick={async () => {
            const r = await window.api.startMirror(d.serial)
            toast(r.message, r.ok ? 'success' : 'error')
            if (r.ok) setPage('mirror')
          }}
        >
          ▶ Mirror
        </Button>
        <Button
          className="small"
          disabled={d.state !== 'device'}
          onClick={async () => {
            const r = await window.api.startAudioOnly(d.serial)
            toast(r.message, r.ok ? 'success' : 'error')
          }}
        >
          ♪ Audio only
        </Button>
        <Button
          className="small"
          disabled={d.state !== 'device'}
          onClick={async () => {
            const r = await window.api.startRecording(d.serial)
            toast(r.message, r.ok ? 'success' : 'error')
          }}
        >
          ● Record
        </Button>
        <span className="spacer" />
        <Button className="small ghost" disabled={d.kind !== 'usb' || d.state !== 'device'} onClick={() => void doWifi()}>
          Wi-Fi connect
        </Button>
        <Button
          className="small ghost"
          onClick={async () => {
            const r = await window.api.disconnectDevice(d.serial.includes(':') ? d.serial : 'all')
            toast(r.message, r.ok ? 'success' : 'error')
          }}
        >
          Disconnect
        </Button>
      </div>
    </div>
  )
}

export function DevicesPage(): React.JSX.Element {
  const { devices, adb, refresh, settings } = useApp()
  const toast = useToast()
  const [ipPort, setIpPort] = useState('')

  return (
    <div className="page">
      <h1 className="page-title">Devices</h1>
      <p className="page-sub">Connected Android devices, refreshed automatically every few seconds.</p>

      {!adb.ready && (
        <div className="banner error">
          <strong>ADB is not available.</strong> Make sure the bundled platform-tools are present
          (resources/scrcpy/adb.exe) or click “Restart ADB”.
        </div>
      )}

      <div className="card">
        <div className="row wrap">
          <Button
            className="primary small"
            onClick={async () => {
              const snap = await window.api.refreshDevices()
              useApp.setState({ devices: snap })
              toast('Devices refreshed', 'success')
            }}
          >
            ↻ Refresh
          </Button>
          <Button
            className="small"
            onClick={async () => {
              const r = await window.api.restartAdb()
              toast(r.message, r.ok ? 'success' : 'error')
            }}
          >
            Restart ADB
          </Button>
          <span className="spacer" />
          <input
            type="text"
            placeholder="192.168.x.x:5555"
            style={{ maxWidth: 220 }}
            value={ipPort}
            onChange={(e) => setIpPort(e.target.value)}
          />
          <Button
            className="small"
            disabled={!ipPort.trim()}
            onClick={async () => {
              const r = await window.api.connectWifi('', ipPort.trim())
              toast(r.message, r.ok ? 'success' : 'error')
              setIpPort('')
            }}
          >
            Connect Wi-Fi ADB
          </Button>
        </div>
      </div>

      {devices.devices.length === 0 ? (
        <div className="card">
          <div className="muted">
            No device detected. Plug a phone with USB debugging enabled, or connect over Wi-Fi
            above.
            {adb.ready ? '' : ' (ADB currently unavailable.)'}
          </div>
        </div>
      ) : (
        devices.devices.map((d) => <DeviceCard key={d.serial} d={d} />)
      )}

      {settings?.global.autoDetectProfiles && devices.candidates.length > 0 && (
        <SectionCard title="Recognized devices & profiles">
          <table className="kv">
            <tbody>
              {devices.candidates.map((c) => (
                <tr key={c.serial}>
                  <td>{c.name}</td>
                  <td>
                    {c.profileName ? (
                      <Badge color="purple">{c.profileName}</Badge>
                    ) : (
                      <span className="muted">no profile bound</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <label className="check" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={c.autoStart}
                        onChange={async (e) => {
                          await window.api.setAutoStart(c.serial, e.target.checked)
                          await refresh()
                        }}
                      />
                      auto-launch
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  )
}
