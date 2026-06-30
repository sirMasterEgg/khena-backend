import type { MediaRepository } from "../repositories/media.repository";
import { db } from "../utils/db";
import {
  isRootPath,
  joinPath,
  normalizePath,
  sanitizeName,
} from "../utils/path";
import type { FileService } from "./file.service";

interface CreateFolderInput {
  path: string;
  folderName: string;
}

interface UploadFileInput {
  name: string;
  type: string;
  size: number;
}

interface UpdateFolderInput {
  path: string;
  folderName: string;
}

interface UpdateFileInput {
  path: string;
  file: UploadFileInput;
}

interface UploadDirectFile {
  name: string;
  type: string;
  body: Buffer | Uint8Array;
}

interface UploadDirectInput {
  path: string;
  files: UploadDirectFile[];
}

interface InitMultipartInput {
  path: string;
  file: UploadFileInput;
}

interface UploadPartInput {
  mediaId: string;
  uploadId: string;
  partNumber: number;
  body: Buffer | Uint8Array;
}

interface CompleteMultipartInput {
  mediaId: string;
  uploadId: string;
  parts: { partNumber: number; eTag: string }[];
}

interface AbortMultipartInput {
  mediaId: string;
  uploadId: string;
}

/** Derive the high-level media category from a mime type. */
function deriveType(mimeType: string): string {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  return "document";
}

/** Extract a lowercase extension (without dot) from a file name. */
function extractExtension(fileName: string): string | null {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return null;
  }
  return fileName.slice(lastDot + 1).toLowerCase();
}

export class MediaService {
  constructor(
    private readonly repo: MediaRepository,
    private readonly fileService: FileService,
  ) {}

  /**
   * Resolve a folder by its path. Returns null id for the root path.
   * Throws when a non-root path does not exist.
   */
  private async resolveFolderId(path: string): Promise<string | null> {
    if (isRootPath(path)) {
      return null;
    }
    const folder = await this.repo.findFolderByPath(normalizePath(path));
    if (!folder) {
      throw new Error("folder not found");
    }
    return folder.id;
  }

  async createFolder(input: CreateFolderInput) {
    const parentPath = normalizePath(input.path);

    let parentId: string | null = null;
    if (!isRootPath(parentPath)) {
      const parent = await this.repo.findFolderByPath(parentPath);
      if (!parent) {
        throw new Error("parent folder not found");
      }
      parentId = parent.id;
    }

    const newPath = joinPath(parentPath, input.folderName);

    const existing = await this.repo.findFolderByPath(newPath);
    if (existing) {
      throw new Error("folder already exists");
    }

    return await this.repo.createFolder({
      name: sanitizeName(input.folderName),
      parentId,
      path: newPath,
    });
  }

  async uploadDirect(input: UploadDirectInput) {
    const path = normalizePath(input.path);
    const folderId = await this.resolveFolderId(path);
    const folderPrefix = isRootPath(path) ? undefined : path.slice(1);

    const results = [];
    for (const file of input.files) {
      const uploaded = await this.fileService.uploadFile({
        fileName: file.name,
        contentType: file.type,
        body: file.body,
        folderPrefix,
      });

      const created = await this.repo.createMedia({
        folderId,
        name: sanitizeName(file.name),
        originalName: file.name,
        type: deriveType(file.type),
        mimeType: file.type,
        extension: extractExtension(file.name),
        sizeBytes: file.body.byteLength,
        storageProvider: uploaded.provider,
        bucket: uploaded.bucket,
        objectKey: uploaded.objectKey,
        status: "ready",
      });

      results.push({
        mediaId: created.id,
        fileName: file.name,
        objectKey: uploaded.objectKey,
      });
    }

    return results;
  }

  async initMultipart(input: InitMultipartInput) {
    const path = normalizePath(input.path);
    const folderId = await this.resolveFolderId(path);
    const folderPrefix = isRootPath(path) ? undefined : path.slice(1);

    const init = await this.fileService.initMultipartUpload({
      fileName: input.file.name,
      contentType: input.file.type,
      sizeBytes: input.file.size,
      folderPrefix,
    });

    const created = await this.repo.createMedia({
      folderId,
      name: sanitizeName(input.file.name),
      originalName: input.file.name,
      type: deriveType(input.file.type),
      mimeType: input.file.type,
      extension: extractExtension(input.file.name),
      sizeBytes: input.file.size,
      storageProvider: init.provider,
      bucket: init.bucket,
      objectKey: init.objectKey,
      status: "pending",
    });

    return {
      mediaId: created.id,
      uploadId: init.uploadId,
      objectKey: init.objectKey,
      partSize: init.partSize,
      partCount: init.partCount,
    };
  }

  async uploadMultipartPart(input: UploadPartInput) {
    const file = await this.repo.findMediaById(input.mediaId);
    if (!file) {
      throw new Error("media not found");
    }

    // objectKey is taken from the DB, never trusted from the client.
    const eTag = await this.fileService.uploadPart(
      file.objectKey,
      input.uploadId,
      input.partNumber,
      input.body,
    );

    return { partNumber: input.partNumber, eTag };
  }

  async completeMultipart(input: CompleteMultipartInput) {
    const file = await this.repo.findMediaById(input.mediaId);
    if (!file) {
      throw new Error("media not found");
    }

    // objectKey is taken from the DB, never trusted from the client.
    await this.fileService.completeMultipartUpload(
      file.objectKey,
      input.uploadId,
      input.parts,
    );

    const metadata = await this.fileService.getFileMetadata(file.objectKey);
    return await this.repo.updateMedia(file.id, {
      status: "ready",
      sizeBytes: metadata.sizeBytes || file.sizeBytes,
      mimeType: metadata.contentType ?? file.mimeType,
    });
  }

  async abortMultipart(input: AbortMultipartInput) {
    const file = await this.repo.findMediaById(input.mediaId);
    if (!file) {
      throw new Error("media not found");
    }

    await this.fileService.abortMultipartUpload(file.objectKey, input.uploadId);
    await this.repo.softDeleteMedia(file.id);

    return { success: true };
  }

  async browse(rawPath: string) {
    const path = normalizePath(rawPath);

    let folderId: string | null = null;
    if (!isRootPath(path)) {
      const folder = await this.repo.findFolderByPath(path);
      if (!folder) {
        throw new Error("folder not found");
      }
      folderId = folder.id;
    }

    const [subFolders, files] = await Promise.all([
      this.repo.findSubFolders(folderId),
      this.repo.findMediaByFolderId(folderId),
    ]);

    return { path, folders: subFolders, files };
  }

  async getFile(id: string) {
    const file = await this.repo.findMediaById(id);
    if (!file) {
      throw new Error("file not found");
    }
    return file;
  }

  /** Stream a file's bytes through the server (no presigned URL). */
  async downloadFile(id: string) {
    const file = await this.repo.findMediaById(id);
    if (!file) {
      throw new Error("file not found");
    }

    const object = await this.fileService.getFileStream(file.objectKey);
    return {
      body: object.body,
      contentType:
        object.contentType ?? file.mimeType ?? "application/octet-stream",
      fileName: file.originalName ?? file.name,
      sizeBytes: object.sizeBytes ?? file.sizeBytes,
    };
  }

  async updateFolder(id: string, input: UpdateFolderInput) {
    return await db.transaction(async (tx) => {
      const folder = await this.repo.findFolderById(id);
      if (!folder) {
        throw new Error("folder not found");
      }

      const parentPath = normalizePath(input.path);
      let parentId: string | null = null;
      if (!isRootPath(parentPath)) {
        const parent = await this.repo.findFolderByPath(parentPath);
        if (!parent) {
          throw new Error("parent folder not found");
        }
        if (parent.id === folder.id) {
          throw new Error("folder cannot be its own parent");
        }
        parentId = parent.id;
      }

      const oldPath = folder.path;
      const newPath = joinPath(parentPath, input.folderName);

      if (newPath !== oldPath) {
        const existing = await this.repo.findFolderByPath(newPath);
        if (existing) {
          throw new Error("folder already exists");
        }
      }

      // Update descendants' path prefix from oldPath -> newPath first,
      // skipping the target folder itself (handled separately below).
      const subtree = await this.repo.findFolderSubtree(oldPath);
      for (const node of subtree) {
        if (node.id === folder.id) {
          continue;
        }
        const updatedPath = `${newPath}${node.path.slice(oldPath.length)}`;
        await this.repo.updateFolder(node.id, { path: updatedPath }, tx);
      }

      return await this.repo.updateFolder(
        id,
        {
          name: sanitizeName(input.folderName),
          parentId,
          path: newPath,
        },
        tx,
      );
    });
  }

  async updateFile(id: string, input: UpdateFileInput) {
    const file = await this.repo.findMediaById(id);
    if (!file) {
      throw new Error("file not found");
    }

    const folderId = await this.resolveFolderId(input.path);

    return await this.repo.updateMedia(id, {
      name: sanitizeName(input.file.name),
      originalName: input.file.name,
      type: deriveType(input.file.type),
      mimeType: input.file.type,
      extension: extractExtension(input.file.name),
      sizeBytes: input.file.size,
      folderId,
    });
  }

  async deleteFolder(id: string) {
    return await db.transaction(async (tx) => {
      const folder = await this.repo.findFolderById(id);
      if (!folder) {
        throw new Error("folder not found");
      }

      // Cascade: target folder + all descendants, plus media inside them.
      const subtree = await this.repo.findFolderSubtree(folder.path);
      const folderIds = subtree.map((f) => f.id);

      await this.repo.softDeleteMediaByFolderIds(folderIds, tx);
      await this.repo.softDeleteFolders(folderIds, tx);

      return { success: true };
    });
  }

  async deleteFile(id: string) {
    const file = await this.repo.findMediaById(id);
    if (!file) {
      throw new Error("file not found");
    }

    await this.repo.softDeleteMedia(file.id);

    // Remove the physical object(s) from storage (idempotent).
    await this.fileService.deleteFile(file.objectKey);
    if (file.thumbnailKey) {
      await this.fileService.deleteFile(file.thumbnailKey);
    }

    return { success: true };
  }
}
