interface Window {
  runtime?: {
    WindowMinimise?(): void;
    WindowIsMaximised?(): Promise<boolean>;
    WindowToggleMaximise?(): void;
    Quit?(): void;
    WindowFullscreen?(): void;
    WindowUnfullscreen?(): void;
    WindowIsFullscreen?(): Promise<boolean>;
  }
  /** B站 Toy JS SDK（入口页引入 toy-sdk.js 后由平台注入，见 docs/dev/Toy JS SDK.md） */
  toy?: ToySDK
}

/** Toy 容器设备类型 */
declare type ToyDeviceType = 'phone' | 'tablet' | 'desktop' | 'unknown'
/** Toy 容器方向 */
declare type ToyOrientation = 'portrait' | 'landscape'

/** Toy 容器视口（CSS px） */
interface ToyViewport {
  width: number
  height: number
}

/** Toy 容器安全区（CSS px） */
interface ToySafeArea {
  top: number
  right: number
  bottom: number
  left: number
}

/** Toy 容器状态 */
interface ToyContainerState {
  deviceType: ToyDeviceType
  viewport: ToyViewport
  safeArea: ToySafeArea
  orientation: ToyOrientation
  immersive: boolean
  /** 本次变化的字段；主动读取返回的恒为空数组 */
  changedFields: string[]
}

/** B站 Toy JS SDK 全局对象（仅声明本项目用到的能力） */
interface ToySDK {
  isSupport?(ability: string): Promise<boolean>
  closeBrowser?(): Promise<void>
  getContainerState?(): Promise<ToyContainerState>
  setContainerMode?(req: {
    orientation?: ToyOrientation | 'auto'
    immersive?: boolean
  }): Promise<void>
  onContainerChange?(listener: (state: ToyContainerState) => void): () => void
}
declare const VERSION_NAME: string;
declare const GIT_COMMIT_ID: string;
declare const GIT_COMMIT_DIRTY: "dirty" | "";
declare const BUILD_TIME: string;
declare type FieldKeysRow<T extends object> = (keyof T | (keyof T)[]);
