export interface IZipDownloadOpts {
  md5?: string;
  aborted?: () => boolean;
  type?: string;
  version?: number;
}
