import type { IEntityData } from "../../defines";

/**
 *
 * @todo
 * @export
 * @param {IEntityData} data
 * @return {IEntityData}
 */
export function make_fighter_data_henry(data: IEntityData): IEntityData {
  data.base.bg_face ??= "sprite/MENU_BACK8.png";
  return data;
}

