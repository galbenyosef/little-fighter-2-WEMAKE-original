import { LocalController } from "../../controller/LocalController";
import { Defines, FacingFlag, SurvivalRankOids, TeamEnum } from "../../defines";
import type { IPropsMeta } from "../../defines/ISchema";
import { Ditto } from "../../ditto";
import { StatBarType } from "../../entity/StatBarType";
import type { ILFWCallback } from "../../ILFWCallback";
import { WorldDataset } from "../../WorldDataset";
import type { UINode } from "../UINode";
import { BackgroundSwitcher } from "./BackgroundSwitcher";
import { CharMenuLogic } from "./CharMenu/CharMenuLogic";
import { StageSwitcher } from "./StageSwitcher";
import { ScrollView } from "./ScrollView";
import { UIComponent } from "./UIComponent";
export interface IGamePrepareLogicProps {
  stage_switcher: StageSwitcher | null,
  bg_switcher: BackgroundSwitcher | null,
  game_mode: string | null,
}
const GAME_MODE_VS = "vs_mode"
const GAME_MODE_STAGE = "stage_mode"
const GAME_MODE_BILI_SURVIVAL = "bilibili_survival"
const RANK_PERIODS = ['all', 'month', 'week', 'day'] as const
type RankPeriod = typeof RANK_PERIODS[number]
/** 单次展示的榜单条数（SDK limit 上限约 100） */
const RANK_LIMIT = 100
/** 榜单行高与行间距（列表不使用 Flex，行位置由 GamePrepareLogic 固定） */
const RANK_ROW_H = 24
const RANK_ROW_GAP = 8
export class GamePrepareLogic extends UIComponent<IGamePrepareLogicProps> {
  static override readonly TAGS: string[] = ["GamePrepareLogic"];
  static override readonly PROPS: IPropsMeta<IGamePrepareLogicProps> = {
    stage_switcher: { type: StageSwitcher, nullable: true },
    bg_switcher: { type: BackgroundSwitcher, nullable: true },
    game_mode: String
  }

  override on_start(): void {
    super.on_start?.();
    this.lfw.callbacks.add(this._lf2_callbacks)
  }
  override on_resume(): void {
    const background_row = this.node.search_node("background_row");
    const stage_row = this.node.search_node("stage_row");
    const char_menu_logic = this.node.search_component(CharMenuLogic)
    if (this.props.game_mode === GAME_MODE_BILI_SURVIVAL) {
      background_row?.set_visible(false).set_disabled(true);
      stage_row?.set_visible(false).set_disabled(true);
      if (char_menu_logic) {
        char_menu_logic.teams = [TeamEnum.Team_1]
        char_menu_logic.min_player = 1;
        char_menu_logic.max_player = 1;
        char_menu_logic.oids = [...SurvivalRankOids];
      }
    } else if (this.props.game_mode === GAME_MODE_STAGE) {
      stage_row?.set_visible(true).set_disabled(false);
      background_row?.set_visible(false).set_disabled(true);
      if (char_menu_logic) char_menu_logic.teams = [TeamEnum.Team_1]
      if (char_menu_logic) char_menu_logic.min_player = 1;
    } else {
      background_row?.set_visible(true).set_disabled(false);
      stage_row?.set_visible(false).set_disabled(true);
      if (char_menu_logic) char_menu_logic.min_player = 2;
    }
    // 生存排行准备页：右侧刷新排行榜
    this.refresh_survival_rank()
  }

  protected rank_period: RankPeriod = 'all'

  /** 生存排行列表不使用 Flex：把 100 行按固定行距一次性排好（ScrollView 只整体平移列表） */
  protected layout_rank_rows(): void {
    const list = this.node.search_node("survival_rank_list")
    if (!list) return
    let y = 0
    for (const row of list.children) {
      row.move_to(0, y, 0)
      y += RANK_ROW_H + RANK_ROW_GAP
    }
  }

  /** 生存排行准备页：左侧选角、右侧展示排行榜（无注入的读取器时隐藏） */
  protected refresh_survival_rank(): void {
    if (this.props.game_mode !== GAME_MODE_BILI_SURVIVAL) return
    this.layout_rank_rows()
    const title = this.node.search_node("survival_rank_title")
    const tabs = this.node.search_node("rank_period_tabs")
    const refresh = this.node.search_node("survival_rank_refresh")
    const scroll = this.node.search_node("survival_rank_scroll")
    const list = this.node.search_node("survival_rank_list")
    const my_node = this.node.search_node("survival_rank_my")
    if (!title && !scroll && !list) return
    const fetch_rank = this.lfw.survival_rank_list
    const fetch_my = this.lfw.survival_rank_my
    const show = !!(fetch_rank || fetch_my)
    title?.set_visible(show)
    tabs?.set_visible(show)
    refresh?.set_visible(show)
    scroll?.set_visible(show)
    my_node?.set_visible(show)
    if (!show) {
      this.clear_rank_rows()
      this.node.search_node("rank_sel_underline")?.set_visible(false)
      return
    }
    this.update_rank_period_tabs()
    if (!list) return
    const rows = [...list.children]
    const period_now: RankPeriod = this.rank_period

    Promise.all([
      fetch_rank ? fetch_rank({ period: period_now, limit: RANK_LIMIT }) : Promise.resolve([]),
      fetch_my ? fetch_my({ period: period_now }) : Promise.resolve(null),
    ])
      .then(([rank_list, mine]) => {
        const entries = (rank_list ?? []).slice(0, RANK_LIMIT)
        const empty = entries.length === 0
        const shown = empty ? 1 : entries.length
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const visible = i < shown
          row.set_visible(visible)
          if (!visible) continue
          const cells = row.children
          const cell = (idx: number) => cells[idx]
          if (empty) {
            cell(0)?.set_text("", cell(0)?.text?.style)
            cell(1)?.set_text(this.lfw.string('bilibili_survival.board_empty'), cell(1)?.text?.style)
            cell(2)?.set_text("", cell(2)?.text?.style)
            continue
          }
          const v = entries[i]!
          cell(0)?.set_text(`${v.rank}.`, cell(0)?.text?.style)
          cell(1)?.set_text(v.nickname, cell(1)?.text?.style)
          cell(2)?.set_text(`${v.score}`, cell(2)?.text?.style)
        }
        scroll?.find_component(ScrollView)?.scroll_to_start()

        if (my_node) {
          const label = this.lfw.string('bilibili_survival.my_rank_label')
          my_node.set_text(
            mine
              ? `${label}：第 ${mine.rank} 名　${mine.score}`
              : `${label}：${this.lfw.string('bilibili_survival.my_rank_none')}`,
            my_node.text?.style,
          )
        }
      })
      .catch(() => { })
  }

  /** 隐藏所有榜单行与“我的排名” */
  protected clear_rank_rows(): void {
    const list = this.node.search_node("survival_rank_list")
    if (list) for (const row of list.children) row.set_visible(false)
    this.node.search_node("survival_rank_my")?.set_visible(false)
  }

  /** 四个周期标签：全榜/月榜/周榜/日榜；选中项高亮，未选中半透明 */
  protected update_rank_period_tabs(): void {
    const under = this.node.search_node("rank_sel_underline")
    let any_selected = false
    for (const p of RANK_PERIODS) {
      const node = this.node.search_node(`survival_rank_period_${p}`)
      if (!node) continue
      const selected = p === this.rank_period
      const style: any = { ...(node.text?.style ?? {}) }
      style.fill_style = selected ? '#ffffff' : '#9b9bff'
      const txt = this.lfw.string(`bilibili_survival.rank_period_${p}`)
      node.set_text(txt, style)
      node.set_opacity(selected ? 1 : 0.5)
      if (!selected) continue
      any_selected = true
      if (under) {
        const g = node.geo
        const w = Math.max((g.right - g.left) || 8, 8)
        under.size.set(w, 2, 0)
        under.move_to_global((g.left + g.right) / 2 - w / 2, g.bottom + 2, 0)
      }
    }
    under?.set_visible(any_selected)
  }

  /** 直接切换到指定周期标签 */
  protected set_survival_rank_period(p: RankPeriod): void {
    if (this.rank_period === p) return
    this.rank_period = p
    this.refresh_survival_rank()
  }

  /** B站生存排行：把 world dataset 重置为默认值（保留难度选择） */
  protected reset_world_dataset(): void {
    const ds = this.world.dataset
    const difficulty = ds.difficulty
    Object.assign(ds, new WorldDataset().dump_dataset())
    ds.difficulty = difficulty
    ds.playrate = 1
  }

  /** 单人固定设置模式（生存排行）：角色就绪倒计时结束后直接开始，不弹设置菜单 */
  get auto_start_when_ready(): boolean {
    return this.props.game_mode === GAME_MODE_BILI_SURVIVAL
  }

  protected _lf2_callbacks: ILFWCallback = {
    on_broadcast: (message) => {
      if (message === 'start_game') return this.start_game();
      if (message === 'rank_refresh') return this.refresh_survival_rank();
      if (message.startsWith('rank_period_set_')) {
        const p = message.substring('rank_period_set_'.length) as RankPeriod
        if ((RANK_PERIODS as readonly string[]).includes(p))
          return this.set_survival_rank_period(p)
      }
    }
  }
  override on_stop(): void {
    this.lfw.change_stage('')
    this.lfw.change_bg('')
    this.lfw.callbacks.del(this._lf2_callbacks)
  }
  start_game() {
    const char_menu_logic = this.node.search_component(CharMenuLogic)
    if (!char_menu_logic) return;

    const { bg_switcher, stage_switcher } = this.props
    const is_survival_rank = this.props.game_mode === GAME_MODE_BILI_SURVIVAL
    if (is_survival_rank) this.reset_world_dataset()
    const survival_stage = is_survival_rank
      ? (this.lfw.datas.stages.find(v => v.chapter === 'survival' && v.is_starting)
        ?? this.lfw.datas.stages.find(v => v.id === '50'))
      : undefined
    if (survival_stage) {
      const bdt = this.lfw.datas.backgrounds.find(v => v.id === survival_stage.bg)
      this.lfw.change_bg(bdt?.id ?? '')
    } else if (stage_switcher?.node.visible && !stage_switcher.node.disabled)
      this.lfw.change_bg(stage_switcher.stage.bg ?? "");
    else if (bg_switcher?.node.visible && !bg_switcher.node.disabled)
      this.lfw.change_bg(bg_switcher.background.id);

    const { far, near, left, right } = this.lfw.world.bg;
    const is_stage_mode = this.props.game_mode === GAME_MODE_STAGE || is_survival_rank
    const is_vs_mode = this.props.game_mode === GAME_MODE_VS

    this.lfw.survival_rank_mode = false
    this.lfw.mt.mark = 'gpl_start_game_cam_x';
    let cam_x = is_stage_mode ? 0 : this.lfw.mt.range(left, right - Defines.MODERN_SCREEN_WIDTH)

    for (const [player, slot_info] of char_menu_logic.players) {
      const { fighter: fighter_data } = slot_info;
      if (!fighter_data) {
        Ditto.warn(`[${GamePrepareLogic.TAG}::start_game] failed to create fighter. figher data: ${fighter_data}`);
        debugger;
        continue;
      }
      const fighter = this.lfw.factory.create_entity(this.world, fighter_data)
      if (!fighter) {
        Ditto.warn(`[${GamePrepareLogic.TAG}::start_game] failed to create fighter. figher data: ${fighter_data}`);
        debugger;
        continue;
      }
      fighter.team = slot_info.team || this.lfw.new_team;
      fighter.stat_bar_type = StatBarType.UI;
      fighter.facing = is_stage_mode ?
        FacingFlag.Right :
        this.lfw.mt.pick([FacingFlag.Left, FacingFlag.Right])!;
      if (player.is_com) {
        fighter.ctrl = this.lfw.factory.create_ctrl(fighter_data.id, player.id, fighter);
      } else {
        fighter.ctrl = new LocalController(player.id, fighter);
      }
      const xx1 = is_stage_mode ? 40 : 1 * Defines.MODERN_SCREEN_WIDTH / 3;
      const xx2 = is_stage_mode ? 80 : 2 * Defines.MODERN_SCREEN_WIDTH / 3;

      this.lfw.mt.mark = 'gpl_fighter_x';
      const x = this.lfw.mt.range(xx1, xx2) + cam_x;
      this.lfw.mt.mark = 'gpl_fighter_z';
      const z = this.lfw.mt.range(far, near)
      const seg = this.world.ground.segment(x, z)
      const y = this.world.ground.y(seg, x, z);
      fighter.set_position(x, y, z);
      fighter.blinking = this.world.dataset.begin_blink_time;
      if (is_vs_mode) fighter.mp = (fighter.mp_max * 2 / 5)
      fighter.attach();
    }

    if (is_survival_rank) {
      this.lfw.change_stage(survival_stage?.id ?? '50');
      this.lfw.survival_rank_mode = true;
      this.lfw.push_ui({ id: "stage_mode_page" });
    } else if (is_stage_mode) {
      if (stage_switcher)
        this.lfw.change_stage(stage_switcher.stage.id ?? "");
      this.lfw.push_ui({ id: "stage_mode_page" });
    } else {
      this.lfw.push_ui({ id: "vs_mode_page" });
    }
    this.world.camera.jump_x(cam_x);
  }
}

