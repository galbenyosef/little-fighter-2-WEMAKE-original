import type { Layer } from "@/LFW/bg/Layer";
import * as T from "../_t";
import { MeshBasicMaterial, RepeatWrapping } from "../_t";
import { BgLayerIndicator } from "./BgLayerIndicator";
import type { BgRender } from "./BgRender";
import { get_static_plane_geometry } from "./GeometryKeeper";
import { MaterialKind as Kind, MaterialFactory } from "./factory";

const pos_mod = (v: number, period: number): number => ((v % period) + period) % period;


export class BgLayerRender {
  readonly mesh: T.Mesh;
  readonly layer: Layer;
  readonly bg_render: BgRender;
  readonly indicators: BgLayerIndicator;
  readonly width: number;
  readonly height: number;
  protected offsetX: number = 0;
  protected offsetY: number = 0;
  protected readonly src_texture: T.Texture | null;
  protected anim_texture: T.Texture | null = null;
  protected anim_material: MeshBasicMaterial | null = null;
  protected anim_on: boolean = false;
  protected readonly shared_material: MeshBasicMaterial;
  constructor(bg_render: BgRender, layer: Layer) {
    this.layer = layer;
    this.bg_render = bg_render
    const { lfw: lf2 } = this.layer.bg.world
    const { info } = layer;
    const { x, y, z, file, id, name, color } = info;
    const pic = file ? lf2.images.find(file)?.pic : null
    const w = pic?.w ?? info.w ?? info.width;
    const h = pic?.h ?? info.h ?? info.height;
    this.width = w;
    this.height = h;
    this.src_texture = file ? (lf2.images.find(file)?.pic?.texture ?? null) : null;

    const k = `bg_l_${file ?? color}`
    const m = MaterialFactory.get(Kind.Basic, MeshBasicMaterial, k, (m) => {
      const texture = file ? lf2.images.find(file)?.pic?.texture : null
      if (texture) m.map = texture
      else if (color !== void 0) m.color.set(color)
      m.transparent = true;
      m.needsUpdate = true;
      m.opacity = 1;
    })
    this.shared_material = m;

    this.mesh = new T.Mesh(
      get_static_plane_geometry(w, h, w / 2, -h / 2),
      m
    );
    this.mesh.name = `bg layer ${name ?? id ?? 'unnamed'}`;
    this.mesh.position.set(x, y, z);
    this.offsetX = 0;
    this.offsetY = 0;
    this.indicators = new BgLayerIndicator(this);
  }

  set_indicator_visible(v: boolean): void {
    this.indicators.set_visible(v);
  }

  render(dt: number): void {
    const {
      visible,
      info: { absolute, offsetAnimX, offsetAnimY }
    } = this.layer;
    this.mesh.visible = visible;
    this.indicators.update();
    if (offsetAnimX !== void 0) this.offsetX += (dt / 1000) * offsetAnimX;
    if (offsetAnimY !== void 0) this.offsetY += (dt / 1000) * offsetAnimY;
    this.update_uv_anim(offsetAnimX, offsetAnimY);
    if (absolute) return;
    const { bg, info: { x, width: layer_width, } } = this.layer;
    const { world } = bg;
    const { screen_w } = world.dataset;
    const { width: bg_width } = world;
    const cam_x = this.bg_render.world_renderer.camera.position.x;
    const _x = bg_width > screen_w ?
      x + (bg_width - layer_width) * cam_x / (bg_width - screen_w) :
      x + (bg_width - layer_width) * cam_x
    this.mesh.position.x = _x;
  }

  protected update_uv_anim(offsetAnimX?: number, offsetAnimY?: number): void {
    const on = !!(offsetAnimX || offsetAnimY);
    if (on !== this.anim_on) {
      this.anim_on = on;
      if (on) this.activate_uv_anim();
      else this.deactivate_uv_anim();
    } else if (on && !this.anim_texture) {
      this.activate_uv_anim();
    }
    const tex = this.anim_texture;
    if (!tex) return;
    const { width, height } = this;
    if (width > 0) tex.offset.x = pos_mod(this.offsetX, width) / width;
    if (height > 0) tex.offset.y = pos_mod(this.offsetY, height) / height;
  }

  protected activate_uv_anim(): void {
    const src = this.src_texture;
    if (!src) return;
    const texture = src.clone();
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.offset.set(0, 0);
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
    });
    this.anim_texture = texture;
    this.anim_material = material;
    this.mesh.material = material;
  }

  protected deactivate_uv_anim(): void {
    this.anim_texture?.dispose();
    this.anim_material?.dispose();
    this.anim_texture = null;
    this.anim_material = null;
    this.mesh.material = this.shared_material;
  }

  release(): void {
    this.deactivate_uv_anim();
  }
}