import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  CompletedPart,
  PresignedDownloadParams,
  PresignedUploadParams,
  PutObjectParams,
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

  async putObject(params: PutObjectParams): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.objectKey,
      Body: params.body,
      ContentType: params.contentType,
    });

    await this.client.send(command);
  }

  async deleteObject(objectKey: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });

    await this.client.send(command);
  }

  async createMultipartUpload(
    objectKey: string,
    contentType: string,
  ): Promise<string> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: contentType,
      }),
    );

    if (!response.UploadId) {
      throw new Error("failed to create multipart upload");
    }
    return response.UploadId;
  }

  async createPresignedUploadPartUrl(
    objectKey: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds?: number,
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: objectKey,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    const expiresIn = expiresInSeconds || this.defaultExpiresIn;
    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async completeMultipartUpload(
    objectKey: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: objectKey,
        UploadId: uploadId,
        MultipartUpload: {
          // S3 requires the parts ordered by PartNumber.
          Parts: parts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.eTag })),
        },
      }),
    );
  }

  async abortMultipartUpload(
    objectKey: string,
    uploadId: string,
  ): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: objectKey,
        UploadId: uploadId,
      }),
    );
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
