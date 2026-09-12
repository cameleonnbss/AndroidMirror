import { useApp } from '../store'
import { Badge, Button, Check, Field, SectionCard, Select } from '../components/ui'
import { SHORTCUT_DEFAULTS } from '@shared/types'
import type { ShortcutAction, AdvancedSettings } from '@renderer/renderer-types'

const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  'toggle-mirror': 'Start / stop mirror',
  'toggle-recording': 'Start / stop recording',
  'gaming-mode': 'Launch Gaming Mode',
  'show-app': 'Show AndroidMirror window',
  'refresh-devices': 'Refresh devices'
}

export function SettingsPage(): React.JSX.Element {
  const { settings, adb, capabilities } = useApp()
  if (!settings) return <div className="page" />
  const g = settings.global

  const save = async (patch: Parameters<typeof window.api.saveGlobal>[0]): Promise<void> => {
    await window.api.saveGlobal(patch)
  }

  const saveAdvanced = async (patch: Partial<AdvancedSettings>): Promise<void> => {
    await save({ advanced: { ...g.advanced, ...patch } })
  }

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Application preferences, shortcuts and advanced scrcpy options.</p>

      <SectionCard title="Application">
        <Check
          checked={g.minimizeToTray}
          onChange={(b) => void save({ minimizeToTray: b })}
          label="Minimize to tray (closing the window keeps sessions alive)"
        />
        <Check
          checked={g.launchOnStartup}
          onChange={(b) => void save({ launchOnStartup: b })}
          label="Launch AndroidMirror when the computer starts"
        />
        <Check
          checked={g.autoDetectProfiles}
          onChange={(b) => void save({ autoDetectProfiles: b })}
          label="Detect known devices and offer their profile automatically"
        />
        <Check
          checked={g.autoStartProfiles}
          onChange={(b) => void save({ autoStartProfiles: b })}
          label="Auto-start bound profile without asking (per-device opt-in below)"
        />
      </SectionCard>

      <SectionCard title="Keyboard shortcuts">
        {(Object.keys(SHORTCUT_LABELS) as ShortcutAction[]).map((action) => (
          <div className="row" key={action} style={{ marginBottom: 8 }}>
            <span style={{ width: 240, fontSize: 13 }}>{SHORTCUT_LABELS[action]}</span>
            <input
              type="text"
              className="mono"
              style={{ width: 130 }}
              value={g.globalShortcuts[action] ?? ''}
              placeholder="e.g. F8 or Ctrl+Shift+M"
              onChange={(e) => {
                void save({
                  globalShortcuts: { ...g.globalShortcuts, [action]: e.target.value }
                })
              }}
            />
            <Button
              className="small ghost"
              onClick={() =>
                void save({ globalShortcuts: { ...g.globalShortcuts, [action]: SHORTCUT_DEFAULTS[action] } })
              }
            >
              Reset
            </Button>
          </div>
        ))}
        <div className="hint">
          Accelerator syntax: F8, Ctrl+Shift+M, Alt+R… Changes apply immediately.
        </div>
      </SectionCard>

      <SectionCard
        title="Advanced scrcpy options"
        right={
          <Badge color={adb.ready ? 'green' : 'red'}>{adb.ready ? 'ADB ready' : 'ADB offline'}</Badge>
        }
      >
        <div className="grid-2">
          <div>
            <Check
              checked={g.advanced.stayAwake}
              onChange={(b) => void saveAdvanced({ stayAwake: b })}
              label="Stay awake (--stay-awake)"
            />
            <Check
              checked={g.advanced.turnScreenOff}
              onChange={(b) => void saveAdvanced({ turnScreenOff: b })}
              label="Turn screen off on start (--turn-screen-off)"
            />
            <Check
              checked={g.advanced.showTouches}
              onChange={(b) => void saveAdvanced({ showTouches: b })}
              label="Show touches (--show-touches)"
            />
            <Check
              checked={g.advanced.keepActive}
              onChange={(b) => void saveAdvanced({ keepActive: b })}
              label="Keep device active (--keep-active)"
            />
            <Check
              checked={g.advanced.powerOffOnClose}
              onChange={(b) => void saveAdvanced({ powerOffOnClose: b })}
              label="Power off on close (--power-off-on-close)"
            />
            <Check
              checked={g.advanced.noCleanup}
              onChange={(b) => void saveAdvanced({ noCleanup: b })}
              label="No cleanup on exit (--no-cleanup)"
            />
            <Check
              checked={g.advanced.fullscreen}
              onChange={(b) => void saveAdvanced({ fullscreen: b })}
              label="Start fullscreen (--fullscreen)"
            />
            <Check
              checked={g.advanced.alwaysOnTop}
              onChange={(b) => void saveAdvanced({ alwaysOnTop: b })}
              label="Always on top (--always-on-top)"
            />
            <Check
              checked={g.advanced.windowBorderless}
              onChange={(b) => void saveAdvanced({ windowBorderless: b })}
              label="Borderless window (--window-borderless)"
            />
          </div>
          <div>
            <Check
              checked={g.advanced.clipboardAutosync}
              onChange={(b) => void saveAdvanced({ clipboardAutosync: b })}
              label="Clipboard auto-sync (on = default)"
            />
            <Check
              checked={g.advanced.legacyPaste}
              onChange={(b) => void saveAdvanced({ legacyPaste: b })}
              label="Legacy paste (--legacy-paste)"
            />
            <Check
              checked={g.advanced.forceAdbForward}
              onChange={(b) => void saveAdvanced({ forceAdbForward: b })}
              label="Force ADB forward (--force-adb-forward)"
            />
            <Check
              checked={g.advanced.killAdbOnClose}
              onChange={(b) => void saveAdvanced({ killAdbOnClose: b })}
              label="Kill ADB on close (--kill-adb-on-close)"
            />
            <Field label="Keyboard mode">
              <Select
                value={g.advanced.keyboard}
                onChange={(e) => void saveAdvanced({ keyboard: e.target.value as AdvancedSettings['keyboard'] })}
              >
                <option value="sdk">sdk</option>
                <option value="uhid">uhid</option>
                <option value="aoa">aoa (USB only)</option>
                <option value="disabled">disabled</option>
              </Select>
            </Field>
            <Field label="Mouse mode">
              <Select
                value={g.advanced.mouse}
                onChange={(e) => void saveAdvanced({ mouse: e.target.value as AdvancedSettings['mouse'] })}
              >
                <option value="sdk">sdk</option>
                <option value="uhid">uhid</option>
                <option value="aoa">aoa (USB only)</option>
                <option value="disabled">disabled</option>
              </Select>
            </Field>
            <Field label="Gamepad mode">
              <Select
                value={g.advanced.gamepad}
                onChange={(e) => void saveAdvanced({ gamepad: e.target.value as AdvancedSettings['gamepad'] })}
              >
                <option value="disabled">disabled</option>
                <option value="uhid">uhid</option>
                <option value="aoa">aoa (USB only)</option>
              </Select>
            </Field>
            <Field label="Extra scrcpy arguments (raw)">
              <input
                type="text"
                className="mono"
                value={g.advanced.extraArgs}
                placeholder="--video-buffer=20 --time-limit=600"
                onChange={(e) => void saveAdvanced({ extraArgs: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <div className="hint">
          These map 1:1 to scrcpy 4.1 flags. Unknown needs? Use the extra-arguments field — anything
          scrcpy supports can be passed through.
        </div>
      </SectionCard>

      <SectionCard title="About & data">
        <table className="kv">
          <tbody>
            <tr>
              <td>scrcpy version</td>
              <td className="mono">{capabilities?.scrcpyVersion || '…'}</td>
            </tr>
            <tr>
              <td>ADB</td>
              <td className="mono">{adb.version ?? 'unavailable'} — {adb.path}</td>
            </tr>
            <tr>
              <td>Recordings folder</td>
              <td>
                <Button className="small ghost" onClick={() => void window.api.openPath('recordings')}>
                  Open
                </Button>
              </td>
            </tr>
            <tr>
              <td>Config folder</td>
              <td>
                <Button className="small ghost" onClick={() => void window.api.openPath('config')}>
                  Open
                </Button>
              </td>
            </tr>
            <tr>
              <td>Open-source licenses</td>
              <td>
                <Button className="small ghost" onClick={() => void window.api.openPath('logs')}>
                  Logs folder
                </Button>{' '}
                <span className="hint" style={{ display: 'inline' }}>
                  scrcpy &amp; platform-tools — Apache-2.0 (see LICENSES/ in the install folder)
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}
