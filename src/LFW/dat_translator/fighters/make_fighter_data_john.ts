import type { IEntityData } from "../../defines";

export function make_fighter_data_john(data: IEntityData) {
  data.base.bg_face ??= "sprite/MENU_BACK9.png";
  return data;
}
