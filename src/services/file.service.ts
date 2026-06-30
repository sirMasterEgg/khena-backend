import { createStorageStrategy } from "./storage/storage.factory";
import type {
  CompletedPart,
  StorageFileMetadata,
  StorageObject,
  StorageStrategy,
} from "./storage/storage.strategy";

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

export interface InitMultipartResult {
  objectKey: string;
  uploadId: string;
  bucket: string;
  provider: string;
  partSize: number;
  partCount: number;
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

    return {
      objectKey,
      uploadId,
      bucket: this.storage.bucket,
      provider: this.storage.provider,
      partSize: PART_SIZE,
      partCount,
    };
  }

  async uploadPart(
    objectKey: string,
    uploadId: string,
    partNumber: number,
    body: Buffer | Uint8Array,
  ): Promise<string> {
    return await this.storage.uploadPart(objectKey, uploadId, partNumber, body);
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

  async getFileStream(objectKey: string): Promise<StorageObject> {
    return await this.storage.getObject(objectKey);
  }

  async deleteFile(objectKey: string): Promise<void> {
    await this.storage.deleteObject(objectKey);
  }

  async getFileMetadata(objectKey: string): Promise<StorageFileMetadata> {
    return await this.storage.getObjectMetadata(objectKey);
  }
}

export const fileService = new FileService(createStorageStrategy());
