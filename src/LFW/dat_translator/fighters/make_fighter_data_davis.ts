import type { IEntityData } from "../../defines";

export function make_fighter_data_davis(data: IEntityData) {
  data.base.bg_face ??= "sprite/MENU_BACK2.png";
  return data;
}
