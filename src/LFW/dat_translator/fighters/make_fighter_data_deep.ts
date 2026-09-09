import { Defines, type IEntityData } from "../../defines";

export function make_fighter_data_deep(data: IEntityData) {
  data.base.bg_face ??= "sprite/MENU_BACK3.png";
  return data;
}
