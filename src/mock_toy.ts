/**
 * 本地(localhost)开发用：模拟 B站 Toy 容器能力。
 *
 * 用法：
 * - `http://localhost:5173/#/?TOY=1`：基础 mock（submitScore 只写控制台/localStorage）。
 * - `http://localhost:5173/#/?TOY=2`：再填充 100 个假榜单数据 + “我”的数据，便于看榜/翻页效果。
 * - 注入 window.toy（isSupport / getContainerState / setContainerMode / onContainerChange /
 *   submitScore / getRankList / getMyRank / getCloudStorage / setCloudStorage / closeBrowser），使 is_toy_env() 等为真。
 * - 已存在真实 window.toy（B站 App 内）时不注入。
 * - deviceType 按视口宽窄自动判定：窗口宽 > 960px 上报 desktop（PC 上不隐藏全屏按钮），
 *   窄窗口(<=960px)或 DevTools 手机模拟则上报 phone（可复现移动端布局）。
 */

const LOG_TAG = '[mock-toy]'
const MAX_FAKE = 100

/** 「我」的历史最高分（localStorage 持久化），默认 148 分（约第 53 名） */
const MY_SCORE_KEY = 'mock_toy_my'

function read_json<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch (e) {
    console.warn(LOG_TAG, `读取 ${key} 失败`, e)
    return fallback
  }
}

const rand_char = (s: string): string => s[Math.floor(Math.random() * s.length)]!

const NICK_CJK = '战魂影月星光辰风雷炎冰霜云火木水金土天星灵圣魔虎豹鹰翼羽夜冥雪山河海空玄紫青苍赤橙黄绿蓝' +
  '梦幻幻灭疾风迅雷极光惊云傲天无双飞龙旋风冰晶烈焰魅影狂刀雷霆裂空暴风骤雨流星奔月剑圣刀客' +
  '小小大大老新快乐无敌战神勇士骑士法师猎人刺客' +
  '零一二三四五六七八九九十百千万' +
  'A B C D E F G H J K L M N O P Q R S T U V W X Y Z'.replace(/ /g, '') +
  'abcdefghijklmnopqrstuvwxyz0123456789'

/** 生成 3~16 字符的随机昵称（中英混搭风格） */
function make_random_nick(): string {
  const len = 3 + Math.floor(Math.random() * 14) // 3 ~ 16
  let out = ''
  for (let i = 0; i < len; i++) out += rand_char(NICK_CJK)
  return out
}

export function install_mock_toy_if_requested(): void {
  const m = /[?&#]TOY=(\d+)/i.exec(window.location.href)
  const level = m ? Number(m[1]) : 0
  if (!level) return
  // 本地通常会因 index.html 无条件加载 toy-sdk.js 而存在一个“无法握手”的死桩 window.toy，
  // 显式带 TOY 参数时用 mock 覆盖它（仅本地/开发；不影响真实 B站容器）。
  if (window.toy)
    console.warn(LOG_TAG, '检测到已有 window.toy（本机多为失效的 toy-sdk 桩），将用 mock 覆盖注入')

  const viewport = { width: window.innerWidth || 794, height: window.innerHeight || 450 }
  // 依据实际视口宽窄上报 deviceType：窗口窄(<=960px，如手机模拟/小窗)才是 phone；
  // 桌面大窗报 desktop，避免 PC 上测试时被误判成移动平台而隐藏全屏按钮。
  const container_state: ToyContainerState = {
    deviceType: viewport.width <= 960 ? 'phone' : 'desktop',
    viewport,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    orientation: 'landscape',
    immersive: true,
    changedFields: [],
  }

  // board 1 = 生存排行（仅本地测试）
  // TOY=2：100 个随机假玩家（3~16 字符昵称，分数 200 → 101），外加“我”（默认 148 分）
  const fake_scores = Array.from({ length: MAX_FAKE }, (_, i) => 200 - i) // i0:200 … i99:101
  const seen = new Set<string>()
  const fake_names: string[] = []
  while (fake_names.length < MAX_FAKE) {
    const nick = make_random_nick()
    if (seen.has(nick)) continue
    seen.add(nick)
    fake_names.push(nick)
  }

  // TOY=1：沿用历史提交列表
  const board_1 = read_json<{ score: number; ts: number }[]>('mock_toy_board_1', [])
  const save_board_1 = () => {
    try {
      localStorage.setItem('mock_toy_board_1', JSON.stringify(board_1.slice(0, MAX_FAKE)))
    } catch (e) {
      console.warn(LOG_TAG, '保存本地排行榜失败', e)
    }
  }

  let my_score = read_json<number>(MY_SCORE_KEY, 148)
  const save_my = () => {
    try {
      localStorage.setItem(MY_SCORE_KEY, JSON.stringify(my_score))
    } catch (e) {
      console.warn(LOG_TAG, '保存我的成绩失败', e)
    }
  }

  // 云存储（真实环境按「登录用户 + Toy」隔离；本地用单一 localStorage 模拟）
  const CLOUD_STORAGE_KEY = 'mock_toy_cloud_storage'
  const cloud_storage = read_json<Record<string, string>>(CLOUD_STORAGE_KEY, {})
  const save_cloud_storage = () => {
    try {
      localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(cloud_storage))
    } catch (e) {
      console.warn(LOG_TAG, '保存云存储失败', e)
    }
  }

  /** 生成榜单行：TOY=2 时 = 100 假 + 我；TOY=1 时 = 历史提交（其中最高的一条视为我） */
  const build_rows = (): { score: number; ts: number; me?: boolean; nick: string }[] => {
    const rows: { score: number; ts: number; me?: boolean; nick: string }[] = []
    if (level >= 2) {
      for (let i = 0; i < MAX_FAKE; i++)
        rows.push({ score: fake_scores[i]!, ts: i, nick: fake_names[i]! })
      rows.push({ score: my_score, ts: MAX_FAKE, me: true, nick: '我' })
    } else {
      for (const v of board_1)
        rows.push({ score: v.score, ts: v.ts, nick: 'me' })
      if (board_1.length)
        rows.push({ score: Math.max(...board_1.map(v => v.score)), ts: Number.MAX_SAFE_INTEGER, me: true, nick: 'me' })
    }
    return rows.sort((a, b) => b.score - a.score || a.ts - b.ts)
  }

  const mock_toy: ToySDK = {
    isSupport: async () => true,
    closeBrowser: async () => console.log(LOG_TAG, 'closeBrowser()'),
    getContainerState: async () => container_state,
    setContainerMode: async (req) => console.log(LOG_TAG, 'setContainerMode()', req),
    onContainerChange: (listener) => {
      listener(container_state)
      return () => { }
    },
    submitScore: async ({ board = 1, score }) => {
      console.log(LOG_TAG, `submitScore() board=${board} score=${score}`)
      if (board === 1) {
        if (level >= 2) {
          // 只保留历史最高分（与真实 SDK 语义一致）
          if (score > my_score) {
            my_score = score
            save_my()
          }
        } else {
          board_1.push({ score, ts: Date.now() })
          save_board_1()
        }
      }
      return { score }
    },
    getRankList: async ({ board = 1, limit = MAX_FAKE } = {}) => {
      if (board !== 1) return []
      const rows = build_rows()
      const ret = rows.slice(0, limit).map((v, i) => ({
        rank: i + 1,
        score: v.score,
        nickname: v.nick,
        avatar: '',
      }))
      console.log(LOG_TAG, `getRankList() 返回 ${ret.length} 条（level=${level}，共 ${rows.length} 行）`)
      return ret
    },
    getMyRank: async ({ board = 1 } = {}) => {
      if (board !== 1) return { ranked: false, rank: 0, score: 0 }
      const rows = build_rows()
      const idx = rows.findIndex(v => v.me)
      if (idx < 0) return { ranked: false, rank: 0, score: 0 }
      return { ranked: true, rank: idx + 1, score: rows[idx]!.score }
    },
    getCloudStorage: async (keys) => {
      if (!keys?.length) return { ...cloud_storage }
      const ret: Record<string, string> = {}
      for (const key of keys) {
        const v = cloud_storage[key]
        if (v !== void 0) ret[key] = v
      }
      return ret
    },
    setCloudStorage: async (items) => {
      Object.assign(cloud_storage, items)
      save_cloud_storage()
      console.log(LOG_TAG, 'setCloudStorage()', items)
    },
  }

  try {
    window.toy = mock_toy
  } catch (e) {
    console.error(LOG_TAG, '覆盖 window.toy 失败（属性只读？），mock 未生效', e)
    return
  }

  console.log(LOG_TAG, `已注入 mock window.toy（TOY=${level}，提交仅本地模拟，不上报 B站）`)
}
