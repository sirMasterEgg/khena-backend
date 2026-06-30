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

export interface PutObjectParams {
  objectKey: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

export interface CompletedPart {
  partNumber: number;
  eTag: string;
}

export interface StorageStrategy {
  readonly provider: string;
  readonly bucket: string;

  createPresignedUploadUrl(params: PresignedUploadParams): Promise<string>;

  createPresignedDownloadUrl(params: PresignedDownloadParams): Promise<string>;

  putObject(params: PutObjectParams): Promise<void>;

  deleteObject(objectKey: string): Promise<void>;

  getObjectMetadata(objectKey: string): Promise<StorageFileMetadata>;

  // ---- multipart (chunked) upload ----

  createMultipartUpload(
    objectKey: string,
    contentType: string,
  ): Promise<string>;

  createPresignedUploadPartUrl(
    objectKey: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds?: number,
  ): Promise<string>;

  completeMultipartUpload(
    objectKey: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void>;

  abortMultipartUpload(objectKey: string, uploadId: string): Promise<void>;
}
