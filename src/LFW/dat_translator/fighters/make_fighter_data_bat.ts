import { EntityGroup, type IEntityData } from "../../defines";
import { ensure } from "../../utils";

export function make_fighter_data_bat(data: IEntityData) {
  data.base.group = ensure(data.base.group, EntityGroup.Boss);
  data.base.bg_face ??= "sprite/MENU_BACK1.png";
  return data;
}
