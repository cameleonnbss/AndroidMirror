# AndroidMirror

Modern desktop app to **mirror, control and record Android devices** — a complete GUI wrapper
around [scrcpy](https://github.com/Genymobile/scrcpy) 4.1 and ADB. No terminal required.

![stack](https://img.shields.io/badge/Electron-44-blue) ![scrcpy](https://img.shields.io/badge/scrcpy-4.1-green)

## Features

- **Device detection** — USB & ADB-over-Wi-Fi, live watcher, model / Android / resolution /
  refresh rate / battery / temperature / storage (only real values are shown, never invented).
- **Mirror & control** — resolution, FPS, bitrate, codec (H.264/H.265/AV1/VP8/VP9), orientation,
  audio on/off, keyboard/mouse/gamepad modes.
- **Audio-only mode** — stream just the phone audio (`--no-video --no-window`), record it to
  wav / opus / aac / flac / m4a / mka.
- **Stream input (OBS)** — "Stream input" launches a borderless, always-on-top capture-ready
  window; select **Camera** as video source to use the phone camera as a webcam (scrcpy 4.1
  `--video-source=camera`, Android 12+).
- **Recording** — screen, audio or both; scrcpy's built-in recorder (mp4 / mkv / …); destination
  folder picker; live ● REC HUD with elapsed time.
- **Gaming Mode** — Low Latency / Balanced / High Quality presets + Custom, applied as scrcpy
  stream tuning (no fake "phone performance" claims).
- **Profiles** — persistent named configs, bindable to a device serial, auto-offered when the
  phone is plugged in (with optional auto-launch).
- **Global shortcuts** — F8 mirror, F9 record, F10 gaming, F7 show window, F5 refresh; all
  remappable in Settings.
- **Multi-device** — one scrcpy instance per device, per-session config.
- **Logs** — every adb/scrcpy command, device events, session lifecycle, errors; copy / export /
  clear.
- **Persistent settings** — single JSON file, schema-migrated, atomic writes.

## Quick start (development)

```bash
npm install
npm run dev        # launch the app in dev mode
npm run build      # typecheck + production build
npm run build:win  # NSIS installer + portable exe in dist/
```

## Distribution layout

```
AndroidMirror/
├── AndroidMirror.exe        ← app (electron)
├── resources/
│   ├── scrcpy/              ← scrcpy.exe, adb.exe, scrcpy-server, DLLs (Apache-2.0)
│   ├── icon/icon.png        ← app icon (drop-in replaceable)
│   └── LICENSES/            ← bundled licenses
└── (user data lives in %APPDATA%/AndroidMirror)
    ├── config/androidmirror-settings.json
    ├── logs/
    ├── profiles/
    └── recordings/
```

`npm run build:win` produces `dist/AndroidMirror-Setup-1.0.0.exe` (installer) and
`dist/AndroidMirror-Portable-1.0.0.exe` (single-file portable).

### Fully self-contained portable exe

`AndroidMirror-Portable-1.0.0.exe` is **one file** — Electron runtime, the app, scrcpy, adb,
all DLLs, icon and licenses are packed inside. Run it anywhere, no installation, no external
dependencies. All user data (config, profiles, logs, recordings) is created next to the exe in
`AndroidMirrorData/`, so it works from a USB stick and leaves nothing in AppData.

## Icon replacement

Drop a new `assets/icon/icon.png` (≥ 256×256, square) — or an `icon.ico` — and rebuild. The
window icon, tray icon, installer and exe icon all pick it up with zero code changes
(see `electron-builder.yml → win.icon` and `src/main/paths.ts → appIcon`).

## scrcpy version contract

The bundled binary is **scrcpy 4.1** (SDL 3.4.12, libavcodec 62.28.102, platform-tools 37.0.0).
All CLI flags emitted by this app are validated against `docs-reference/scrcpy_help.txt`
(captured from the shipped binary). To upgrade scrcpy: replace the files in `resources/scrcpy/`,
update the flag catalog in `src/shared/scrcpy-catalog.ts` if the CLI changed, and re-capture
`--help` into `docs-reference/`.

## Architecture

```
src/
├── shared/          ← types + scrcpy flag catalog + IPC contract (used by both sides)
├── main/            ← Electron main process
│   ├── adb.ts             adb wrapper (devices, getprop, battery, storage, wifi)
│   ├── device-watcher.ts  polling watcher + new-device events + auto-profile matching
│   ├── scrcpy-args.ts     settings → scrcpy CLI translation (v4.1 flags only)
│   ├── session-manager.ts scrcpy process lifecycle, per-device sessions
│   ├── capabilities.ts    version probe + per-device --list-encoders
│   ├── store.ts           JSON settings store (atomic writes, schema migration)
│   ├── logger.ts          ring buffer + file logs + live IPC stream
│   └── index.ts           window, tray, IPC handlers, global shortcuts
├── preload/         ← contextBridge API (no nodeIntegration in renderer)
└── renderer/        ← React 19 + Zustand, dark UI (sidebar + 8 pages)
```

Why Electron here: the mirroring protocol, decoding, input injection and recording are already
implemented by the scrcpy binary — the GUI's job is orchestration, not video processing, so a
native rewrite would add risk without latency gains. The renderer is sandboxed
(`contextIsolation: true`, `nodeIntegration: false`), all privileged work lives in main.

## Error handling contract

- ADB missing / unauthorized device / codec fallback scenarios produce explicit banners and
  toasts — the app never crashes because of an adb/scrcpy error.
- Session exit codes are interpreted: `0` normal, `2` device disconnected, other = failure
  (logged with scrcpy's own stderr).
- Settings files that are old or partially corrupt are migrated field-by-field on load.

## Licenses

- scrcpy & Android platform-tools: Apache-2.0 (shipped in `resources/scrcpy/LICENSE.txt` and
  `resources/LICENSES/`, also embedded in the installer).
- AndroidMirror itself: MIT (see LICENSE).
