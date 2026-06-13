import { createStorageStrategy } from "./storage/storage.factory";
import type {
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
