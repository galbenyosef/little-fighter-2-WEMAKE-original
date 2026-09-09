import type { IEntityData } from "../../defines";


export function make_fighter_data_woody(data: IEntityData) {
  data.base.bg_face ??= "sprite/MENU_BACK13.png";
  return data;
}
