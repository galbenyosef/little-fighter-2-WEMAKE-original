import type { IEntityData } from "../defines/IEntityData";
import { Entity } from "../entity/Entity";
import { is_weapon } from "../entity/type_check";
import { ObjectsHelper } from "./EntitiesHelper";
import { Randoming } from "./Randoming";

export class WeaponsHelper extends ObjectsHelper {
  readonly random_map = new Map<string, Randoming<IEntityData>>()
  readonly random_d_map = new Map<string, Randoming<IEntityData>>()
  override get all(): Entity[] {
    const ret: Entity[] = [];
    this.lfw.world.entities.forEach((v) => is_weapon(v) && ret.push(v));
    return ret;
  }
  override add(
    data?: IEntityData | string,
    num: number = 1,
    team?: string,
  ): Entity[] {
    if (typeof data === "string")
      data = this.lfw.datas.find_weapon(data);
    if (!data) return [];
    return this.lfw.entities.add(data, num, team);
  }
  randoms(groups: string, duplicate: boolean) {
    const map = duplicate ? this.random_d_map : this.random_map
    let ret = map.get(groups);
    if (ret) return ret;
    let list = this.lfw.datas.weapons;
    let name = 'weapons_randoms';
    if (groups.length) {
      const gg = groups.split(',').map(v => v.trim());
      name += '_' + gg.join('_');
      list = list.filter(v => v.base.group?.some(a => gg.includes(a)))
    }
    if (!list.length) return void 0;
    ret = new Randoming(name, list, this.lfw.mt, duplicate);
    map.set(groups, ret);
    return ret;
  }
  add_random(num = 1, duplicate = false, group: string = ''): Entity[] {
    const randoms = this.randoms(group, duplicate)
    const ret: Entity[] = [];
    if (!randoms) return ret;

    while (--num >= 0) {
      const d = randoms.get();
      if (!d) continue;
      ret.push(...this.add(d, 1));
    }
    return ret;
  }
}
