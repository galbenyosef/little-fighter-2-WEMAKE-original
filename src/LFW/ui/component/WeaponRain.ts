import { EntityGroup, type IPropsMeta } from "../../defines";
import { floor, pow, Times } from "../../utils";
import { UIComponent } from "./UIComponent";

const DEFAULT_CHANCE = 0.2;
const DEFAULT_INTERVAL = 1200;
const DEFAULT_POWER = 1.5;
const ROLL_SCALE = 20000;

export interface IWeaponRainProps {
  groups?: string;
  chance?: number;
  interval?: number;
  power?: number;
}
export class WeaponRain extends UIComponent<IWeaponRainProps> {
  static override readonly TAGS: string[] = ["WeaponRain"];
  static override readonly PROPS: IPropsMeta<IWeaponRainProps> = {
    groups: { type: String, nullable: true },
    chance: { type: Number, nullable: true },
    interval: { type: Number, nullable: true },
    power: { type: Number, nullable: true },
  };
  protected timer = new Times(0, DEFAULT_INTERVAL);
  override on_start(): void {
    super.on_start?.();
    const { interval } = this.props;
    if (interval != null) this.timer.set_range(0, interval);
  }
  override update(dt: number): void {
    if (this.world.paused) return;
    if (this.world.stage.weapon_rain_disabled) return;
    if (!this.timer.add(dt)) return;
    this.try_drop_weapon();
  }

  protected try_drop_weapon(): void {
    const { world } = this;
    const { 
      groups = EntityGroup.VsWeapon, 
      chance = DEFAULT_CHANCE, 
      power = DEFAULT_POWER 
    } = this.props;
    const { mt, weapons } = this.lfw;
    mt.mark = 'weapon_rain_range';
    const x = mt.range(world.left, world.right);
    const count = world.weapon_count_at(x);
    mt.mark = 'weapon_rain_chance';
    const threshold = floor((chance / pow(1 + count, power)) * ROLL_SCALE);
    if (mt.range(0, ROLL_SCALE) >= threshold) return;
    const [entity] = weapons.add_random(1, true, groups);
    if (!entity) return;
    entity.set_position(x);
  }
}
