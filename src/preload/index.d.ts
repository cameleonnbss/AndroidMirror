import type { AndroidMirrorApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    api: AndroidMirrorApi
  }
}

export {}
