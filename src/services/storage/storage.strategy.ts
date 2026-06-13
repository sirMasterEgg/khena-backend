export interface PresignedUploadParams {
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface PresignedDownloadParams {
  objectKey: string;
  expiresInSeconds?: number;
}

export interface StorageFileMetadata {
  objectKey: string;
  sizeBytes: number;
  contentType: string | null;
  lastModified: Date | null;
  etag: string | null;
}

export interface StorageStrategy {
  readonly provider: string;
  readonly bucket: string;

  createPresignedUploadUrl(params: PresignedUploadParams): Promise<string>;

  createPresignedDownloadUrl(params: PresignedDownloadParams): Promise<string>;

  deleteObject(objectKey: string): Promise<void>;

  getObjectMetadata(objectKey: string): Promise<StorageFileMetadata>;
}
