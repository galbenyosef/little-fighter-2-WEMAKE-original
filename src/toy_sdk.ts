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

/** 生存排行使用的榜位（1~3，含义自定；见 docs/dev/Toy JS SDK.md） */
export const SURVIVAL_RANK_BOARD = 1

/** 云存储 key 前缀：已成功提交过的最高分（按榜位区分；key 只允许字母/数字/下划线/短横线） */
const SUBMITTED_RANK_SCORE_KEY = 'rank_submitted_max_'

const submitted_rank_score_key = (board: number) => SUBMITTED_RANK_SCORE_KEY + board

/** 会话内缓存（云存储读一次后复用）；未缓存表示还没读过 */
const submitted_rank_score_cache = new Map<number, number | null>()

/** 读云存储里记录的“我成功提交过的最高分”（没记录/读失败返回 null；读失败不缓存，下次重试） */
async function read_submitted_rank_score(board: number): Promise<number | null> {
  if (submitted_rank_score_cache.has(board)) return submitted_rank_score_cache.get(board)!
  const toy = get_toy()
  if (!toy?.getCloudStorage) return null
  const key = submitted_rank_score_key(board)
  try {
    const all = await toy.getCloudStorage([key])
    const raw = all?.[key]
    const score = raw == null ? NaN : Number(raw)
    const value = Number.isFinite(score) ? score : null
    submitted_rank_score_cache.set(board, value)
    return value
  } catch (e) {
    console.warn(LOG_TAG, 'getCloudStorage 失败', e)
    return null
  }
}

async function write_submitted_rank_score(board: number, score: number): Promise<void> {
  submitted_rank_score_cache.set(board, score)
  const toy = get_toy()
  if (!toy?.setCloudStorage) return
  try {
    await toy.setCloudStorage({ [submitted_rank_score_key(board)]: `${score}` })
  } catch (e) {
    console.warn(LOG_TAG, 'setCloudStorage 失败', e)
  }
}

/** 云存储中“我成功提交过的最高分”（没有记录时返回 null） */
export async function get_submitted_rank_score(
  board: number = SURVIVAL_RANK_BOARD,
): Promise<number | null> {
  return read_submitted_rank_score(board)
}

/**
 * 上报分数到排行榜；仅在 Toy 环境 + 能力可用 + 高于云存储记录时提交（失败/跳过静默）。
 *
 * 服务端只保留历史最高分，因此用云存储（按「登录用户 + Toy」隔离）记录“已成功提交过的最高分”：
 * - 已有记录且本次不更高 → 跳过（避免重开一局后重复上报低分）；
 * - 没有记录（首次运行/换设备）→ 立刻提交一次，成功后写入记录。
 */
export async function submit_rank_score(
  score: number,
  board: number = SURVIVAL_RANK_BOARD,
): Promise<boolean> {
  const toy = get_toy()
  if (!toy?.submitScore) return false
  const submitted = await read_submitted_rank_score(board)
  if (submitted != null && score <= submitted) return false
  if (!(await toy_capable('submitScore'))) return false
  try {
    const ret: { score?: number } | undefined = await toy.submitScore({ board, score })
    const server_score = ret?.score
    await write_submitted_rank_score(
      board,
      typeof server_score === 'number' && Number.isFinite(server_score)
        ? Math.max(score, server_score)
        : score,
    )
    return true
  } catch (e) {
    console.warn(LOG_TAG, `submitScore(board=${board}, score=${score}) 失败`, e)
    return false
  }
}

/** 读取榜单（游客可读） */
export async function get_rank_list(
  opts: { board?: number; period?: ToyRankPeriod; limit?: number } = {},
): Promise<ToyRankItem[]> {
  const toy = get_toy()
  if (!toy?.getRankList) return []
  if (!(await toy_capable('getRankList'))) return []
  try {
    return await toy.getRankList({ board: SURVIVAL_RANK_BOARD, ...opts })
  } catch (e) {
    console.warn(LOG_TAG, 'getRankList 失败', e)
    return []
  }
}

/** 查询我在榜单的排名（未上榜 ranked=false） */
export async function get_my_rank(
  opts: { board?: number; period?: ToyRankPeriod } = {},
): Promise<ToyMyRank | null> {
  const toy = get_toy()
  if (!toy?.getMyRank) return null
  if (!(await toy_capable('getMyRank'))) return null
  try {
    return await toy.getMyRank({ board: SURVIVAL_RANK_BOARD, ...opts })
  } catch (e) {
    console.warn(LOG_TAG, 'getMyRank 失败', e)
    return null
  }
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
