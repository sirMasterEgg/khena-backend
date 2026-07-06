import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { NotFoundError } from "../../utils/errors";
import type {
  CompletedPart,
  PutObjectParams,
  StorageFileMetadata,
  StorageObject,
  StorageStrategy,
} from "./storage.strategy";

export class S3StorageStrategy implements StorageStrategy {
  readonly provider: string;
  readonly bucket: string;
  private readonly client: S3Client;

  constructor() {
    this.provider = process.env.STORAGE_PROVIDER || "s3";
    this.bucket = process.env.S3_BUCKET || "khena-media";

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

  async putObject(params: PutObjectParams): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.objectKey,
      Body: params.body,
      ContentType: params.contentType,
    });

    await this.client.send(command);
  }

  async getObject(objectKey: string): Promise<StorageObject> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );

    if (!response.Body) {
      throw new NotFoundError("object not found");
    }

    return {
      body: response.Body.transformToWebStream(),
      contentType: response.ContentType || null,
      sizeBytes: response.ContentLength ?? null,
    };
  }

  async deleteObject(objectKey: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });

    await this.client.send(command);
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    // CopySource harus berformat `${bucket}/${sourceKey}` dan di-encode per
    // segmen agar karakter khusus (spasi, dsb.) tidak merusak header.
    const copySource = [this.bucket, ...sourceKey.split("/")]
      .map(encodeURIComponent)
      .join("/");

    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      Key: destinationKey,
      CopySource: copySource,
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

  async uploadPart(
    objectKey: string,
    uploadId: string,
    partNumber: number,
    body: Buffer | Uint8Array,
  ): Promise<string> {
    const response = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
      }),
    );

    if (!response.ETag) {
      throw new Error("failed to upload part");
    }
    return response.ETag;
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
