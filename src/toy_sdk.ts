const LOG_TAG = '[toy_sdk]'

export function get_toy(): ToySDK | undefined {
  return window.toy
}

export function is_toy_env(): boolean {
  return !!get_toy()?.isSupport
}

export async function toy_capable(ability: string): Promise<boolean> {
  const toy = get_toy()
  if (!toy?.isSupport) return false
  try {
    return await toy.isSupport(ability)
  } catch (e) {
    console.warn(LOG_TAG, `isSupport('${ability}') 失败`, e)
    return false
  }
}

export async function get_container_state(): Promise<ToyContainerState | null> {
  const toy = get_toy()
  if (!toy?.getContainerState) return null
  try {
    return await toy.getContainerState()
  } catch (e) {
    console.warn(LOG_TAG, 'getContainerState 失败', e)
    return null
  }
}

export async function close_browser(): Promise<boolean> {
  const toy = get_toy()
  if (!toy?.closeBrowser) return false
  if (!(await toy_capable('closeBrowser'))) return false
  try {
    await toy.closeBrowser()
    return true
  } catch (e) {
    console.warn(LOG_TAG, 'closeBrowser 失败', e)
    return false
  }
}

export function is_mobile_device(device_type: ToyDeviceType): boolean {
  return device_type === 'phone' || device_type === 'tablet'
}

function already_immersive_landscape(state: ToyContainerState): boolean {
  return state.orientation === 'landscape' && !!state.immersive
}

const IMMERSIVE_LANDSCAPE = { orientation: 'landscape', immersive: true } as const

function sync_layout_classes(state: ToyContainerState) {
  const el = document.documentElement
  el.classList.toggle('mobile', state.deviceType === 'phone')
  el.classList.toggle('tablet', state.deviceType === 'tablet')
  el.classList.toggle('portrait', state.orientation === 'portrait')
  el.classList.toggle('landscape', state.orientation === 'landscape')
}

let off_container_change: (() => void) | null = null
let retry_timer: ReturnType<typeof setTimeout> | undefined = undefined

function stop_listening() {
  off_container_change?.()
  off_container_change = null
}

function cancel_retry() {
  if (retry_timer !== undefined) {
    clearTimeout(retry_timer)
    retry_timer = undefined
  }
}

function handle_state_change(state: ToyContainerState) {
  if (!state) return
  sync_layout_classes(state)
  if (already_immersive_landscape(state)) {
    stop_listening()
    cancel_retry()
  }
}

async function apply_immersive_landscape() {
  const toy = get_toy()
  if (!toy?.setContainerMode) return
  try {
    await toy.setContainerMode(IMMERSIVE_LANDSCAPE)
  } catch (e) {
    console.warn(LOG_TAG, 'setContainerMode 失败', e)
  }
}

export async function enable_immersive_landscape(): Promise<boolean> {
  const toy = get_toy()
  if (!toy?.isSupport) return false

  const [ok_state, ok_mode, ok_listen] = await Promise.all([
    toy_capable('getContainerState'),
    toy_capable('setContainerMode'),
    toy_capable('onContainerChange'),
  ])
  if (!ok_state || !ok_mode) return false

  const state = await get_container_state()
  if (!state) return false
  if (!is_mobile_device(state.deviceType)) return false

  sync_layout_classes(state)
  if (already_immersive_landscape(state)) return true

  if (ok_listen && toy.onContainerChange) {
    stop_listening()
    off_container_change = toy.onContainerChange(handle_state_change)
  }

  await apply_immersive_landscape()

  cancel_retry()
  retry_timer = setTimeout(async () => {
    const latest = await get_container_state()
    if (latest && is_mobile_device(latest.deviceType) && !already_immersive_landscape(latest)) {
      sync_layout_classes(latest)
      await apply_immersive_landscape()
    }
  }, 2000)

  return true
}
