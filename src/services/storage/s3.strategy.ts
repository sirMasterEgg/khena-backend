import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  PresignedDownloadParams,
  PresignedUploadParams,
  StorageFileMetadata,
  StorageStrategy,
} from "./storage.strategy";

export class S3StorageStrategy implements StorageStrategy {
  readonly provider: string;
  readonly bucket: string;
  private readonly client: S3Client;
  private readonly defaultExpiresIn: number;

  constructor() {
    this.provider = process.env.STORAGE_PROVIDER || "s3";
    this.bucket = process.env.S3_BUCKET || "khena-media";
    this.defaultExpiresIn = Number(process.env.PRESIGN_EXPIRES_SECONDS) || 900;

    const baseConfig = {
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
      },
    };

    const clientConfig = process.env.S3_ENDPOINT
      ? {
          ...baseConfig,
          endpoint: process.env.S3_ENDPOINT,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        }
      : baseConfig;

    this.client = new S3Client(clientConfig);
  }

  async createPresignedUploadUrl(
    params: PresignedUploadParams,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.objectKey,
      ContentType: params.contentType,
    });

    const expiresIn = params.expiresInSeconds || this.defaultExpiresIn;
    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async createPresignedDownloadUrl(
    params: PresignedDownloadParams,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.objectKey,
    });

    const expiresIn = params.expiresInSeconds || this.defaultExpiresIn;
    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async deleteObject(objectKey: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });

    await this.client.send(command);
  }

  async getObjectMetadata(objectKey: string): Promise<StorageFileMetadata> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });

    const response = await this.client.send(command);

    return {
      objectKey,
      sizeBytes: response.ContentLength || 0,
      contentType: response.ContentType || null,
      lastModified: response.LastModified || null,
      etag: response.ETag || null,
    };
  }
}
