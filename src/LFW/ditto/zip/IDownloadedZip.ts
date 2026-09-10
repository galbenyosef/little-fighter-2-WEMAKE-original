import type { IBlob } from "../IBlob";

export interface IDownloadedZip {
  blob: IBlob;
  md5: string;
  size: number;
  stored: boolean;
}
