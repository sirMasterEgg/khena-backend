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

export interface StorageObject {
  body: ReadableStream;
  contentType: string | null;
  sizeBytes: number | null;
}

export interface CompletedPart {
  partNumber: number;
  eTag: string;
}

export interface StorageStrategy {
  readonly provider: string;
  readonly bucket: string;

  putObject(params: PutObjectParams): Promise<void>;

  getObject(objectKey: string): Promise<StorageObject>;

  deleteObject(objectKey: string): Promise<void>;

  getObjectMetadata(objectKey: string): Promise<StorageFileMetadata>;

  // ---- multipart (chunked) upload — all bytes flow through the server ----

  createMultipartUpload(
    objectKey: string,
    contentType: string,
  ): Promise<string>;

  uploadPart(
    objectKey: string,
    uploadId: string,
    partNumber: number,
    body: Buffer | Uint8Array,
  ): Promise<string>;

  completeMultipartUpload(
    objectKey: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void>;

  abortMultipartUpload(objectKey: string, uploadId: string): Promise<void>;
}
