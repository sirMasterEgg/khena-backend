import { createStorageStrategy } from "./storage/storage.factory";
import type {
  CompletedPart,
  StorageFileMetadata,
  StorageStrategy,
} from "./storage/storage.strategy";

export interface GenerateUploadUrlInput {
  fileName: string;
  contentType: string;
  folderPrefix?: string;
  expiresInSeconds?: number;
}

export interface GenerateUploadUrlResult {
  uploadUrl: string;
  objectKey: string;
  bucket: string;
  provider: string;
  expiresInSeconds: number;
}

export interface UploadFileInput {
  fileName: string;
  contentType: string;
  body: Buffer | Uint8Array;
  folderPrefix?: string;
}

export interface UploadFileResult {
  objectKey: string;
  bucket: string;
  provider: string;
}

export interface InitMultipartInput {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  folderPrefix?: string;
}

export interface MultipartPartUrl {
  partNumber: number;
  uploadUrl: string;
}

export interface InitMultipartResult {
  objectKey: string;
  uploadId: string;
  bucket: string;
  provider: string;
  partSize: number;
  parts: MultipartPartUrl[];
}

// Ukuran tiap part untuk multipart upload. Minimal 5 MB (batasan S3).
const PART_SIZE = Number(process.env.MULTIPART_PART_SIZE) || 10 * 1024 * 1024;
const MAX_PARTS = 10_000;

function sanitizeFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

function generateObjectKey(fileName: string, folderPrefix?: string): string {
  const safeFileName = sanitizeFileName(fileName);
  const folder = folderPrefix || "misc";
  const uuid = Bun.randomUUIDv7();

  return `${folder}/${uuid}-${safeFileName}`;
}

export class FileService {
  constructor(private readonly storage: StorageStrategy) {}

  async generatePresignedUploadUrl(
    input: GenerateUploadUrlInput,
  ): Promise<GenerateUploadUrlResult> {
    const objectKey = generateObjectKey(input.fileName, input.folderPrefix);

    const uploadUrl = await this.storage.createPresignedUploadUrl({
      objectKey,
      contentType: input.contentType,
      expiresInSeconds: input.expiresInSeconds,
    });

    return {
      uploadUrl,
      objectKey,
      bucket: this.storage.bucket,
      provider: this.storage.provider,
      expiresInSeconds: input.expiresInSeconds || 900,
    };
  }

  async uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
    const objectKey = generateObjectKey(input.fileName, input.folderPrefix);

    await this.storage.putObject({
      objectKey,
      body: input.body,
      contentType: input.contentType,
    });

    return {
      objectKey,
      bucket: this.storage.bucket,
      provider: this.storage.provider,
    };
  }

  async initMultipartUpload(
    input: InitMultipartInput,
  ): Promise<InitMultipartResult> {
    const objectKey = generateObjectKey(input.fileName, input.folderPrefix);
    const partCount = Math.ceil(input.sizeBytes / PART_SIZE);
    if (partCount < 1 || partCount > MAX_PARTS) {
      throw new Error("file too large or invalid size for multipart upload");
    }

    const uploadId = await this.storage.createMultipartUpload(
      objectKey,
      input.contentType,
    );

    const parts: MultipartPartUrl[] = [];
    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      const uploadUrl = await this.storage.createPresignedUploadPartUrl(
        objectKey,
        uploadId,
        partNumber,
      );
      parts.push({ partNumber, uploadUrl });
    }

    return {
      objectKey,
      uploadId,
      bucket: this.storage.bucket,
      provider: this.storage.provider,
      partSize: PART_SIZE,
      parts,
    };
  }

  async completeMultipartUpload(
    objectKey: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.storage.completeMultipartUpload(objectKey, uploadId, parts);
  }

  async abortMultipartUpload(
    objectKey: string,
    uploadId: string,
  ): Promise<void> {
    await this.storage.abortMultipartUpload(objectKey, uploadId);
  }

  async generatePresignedDownloadUrl(
    objectKey: string,
    expiresInSeconds?: number,
  ): Promise<string> {
    return await this.storage.createPresignedDownloadUrl({
      objectKey,
      expiresInSeconds,
    });
  }

  async deleteFile(objectKey: string): Promise<void> {
    await this.storage.deleteObject(objectKey);
  }

  async getFileMetadata(objectKey: string): Promise<StorageFileMetadata> {
    return await this.storage.getObjectMetadata(objectKey);
  }
}

export const fileService = new FileService(createStorageStrategy());
