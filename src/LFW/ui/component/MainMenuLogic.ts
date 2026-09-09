import type { UINode } from "../UINode";
import { UIComponent } from "./UIComponent";

/**
 * 主菜单入口的环境开关：
 * 「B站生存排行」仅在 B站 Toy 环境（lfw.toy_env）可用；非 Toy 环境隐藏并禁用入口按钮。
 */
export class MainMenuLogic extends UIComponent<{}> {
  static override readonly TAGS: string[] = ["MainMenuLogic"];
  protected _survival_btn: UINode | null | undefined;
  protected get survival_btn(): UINode | null {
    if (this._survival_btn !== undefined) return this._survival_btn;
    this._survival_btn = this.node.search_node("btn_bilibili_survival") ?? null;
    return this._survival_btn;
  }
  protected apply(): void {
    const toy = this.lfw.toy_env;
    const btn = this.survival_btn;
    btn?.set_visible(toy);
    btn?.set_disabled(!toy);
  }
  override on_start(): void {
    super.on_start?.();
    this.apply();
  }
  override on_resume(): void {
    super.on_resume?.();
    this.apply();
  }
}
