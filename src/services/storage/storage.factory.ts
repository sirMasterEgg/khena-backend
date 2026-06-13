import { S3StorageStrategy } from "./s3.strategy";
import type { StorageStrategy } from "./storage.strategy";

export function createStorageStrategy(provider?: string): StorageStrategy {
  const selected = provider ?? process.env.STORAGE_PROVIDER ?? "s3";

  switch (selected) {
    case "s3":
    case "r2":
    case "minio":
      return new S3StorageStrategy();
    default:
      throw new Error(`unsupported storage provider: ${selected}`);
  }
}
