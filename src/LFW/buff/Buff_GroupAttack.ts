import { Buff } from "./Buff";
import { reg_group_attack_kind } from "./group_attack_flags";

/**
 * “群攻”buff：让携带者 kind 0（ItrKind.Normal，拳击/普通攻击）的 itr
 * 由 arest（单攻：一次攻击只能命中一个目标）变为 vrest（群攻：可命中多个不同目标，每目标只中一次）。
 *
 * 该 buff 本身只是“标记”：模块加载时把 KIND 登记进 group_attack_flags，
 * 碰撞逻辑在 collision_new 里据此把 kind0 itr 的 rest 当 vrest 处理。
 *
 * 通过 itr 的 A_BUFF action 施加到攻击者自身，例如：
 *   { type: ActionType.A_BUFF, data: { buff: Buff_GroupAttack.KIND, duration: 240 } }
 */
export class Buff_GroupAttack extends Buff {
  static override readonly KIND = "GroupAttack";
}

reg_group_attack_kind(Buff_GroupAttack.KIND);
