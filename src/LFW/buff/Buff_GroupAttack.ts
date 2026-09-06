import type { Entity } from "../entity/Entity";
import { Buff } from "./Buff";

export class Buff_GroupAttack extends Buff {
  static override readonly KIND = "GroupAttack";

  static has_on(entity: Entity): boolean {
    return entity.world.buffs.has(Buff_GroupAttack.id_of(entity.id));
  }

  static id_of(entity_id: string): string {
    return `${Buff_GroupAttack.KIND}_${entity_id}`;
  }
}
