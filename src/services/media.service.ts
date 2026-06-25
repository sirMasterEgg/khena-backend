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

interface UploadInput {
  path: string;
  files: UploadFileInput[];
}

interface ConfirmInput {
  mediaIds: string[];
}

interface UpdateFolderInput {
  path: string;
  folderName: string;
}

interface UpdateFileInput {
  path: string;
  file: UploadFileInput;
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

  async generateUploadUrls(input: UploadInput) {
    const path = normalizePath(input.path);
    const folderId = await this.resolveFolderId(path);
    const folderPrefix = isRootPath(path) ? undefined : path.slice(1);

    const results = [];
    for (const file of input.files) {
      const presigned = await this.fileService.generatePresignedUploadUrl({
        fileName: file.name,
        contentType: file.type,
        folderPrefix,
      });

      const created = await this.repo.createMedia({
        folderId,
        name: sanitizeName(file.name),
        originalName: file.name,
        type: deriveType(file.type),
        mimeType: file.type,
        extension: extractExtension(file.name),
        sizeBytes: file.size,
        storageProvider: presigned.provider,
        bucket: presigned.bucket,
        objectKey: presigned.objectKey,
        status: "pending",
      });

      results.push({
        mediaId: created.id,
        fileName: file.name,
        uploadUrl: presigned.uploadUrl,
        objectKey: presigned.objectKey,
        expiresInSeconds: presigned.expiresInSeconds,
      });
    }

    return results;
  }

  async confirmUploads(input: ConfirmInput) {
    const found = await this.repo.findMediaByIds(input.mediaIds);
    const foundIds = new Set(found.map((m) => m.id));
    for (const id of input.mediaIds) {
      if (!foundIds.has(id)) {
        throw new Error(`media ${id} not found`);
      }
    }

    return await db.transaction(async (tx) => {
      const updated = [];
      for (const m of found) {
        // Verify the object actually landed in storage before marking ready.
        const metadata = await this.fileService.getFileMetadata(m.objectKey);
        const row = await this.repo.updateMedia(
          m.id,
          {
            status: "ready",
            sizeBytes: metadata.sizeBytes || m.sizeBytes,
            mimeType: metadata.contentType ?? m.mimeType,
          },
          tx,
        );
        updated.push(row);
      }
      return updated;
    });
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
    const downloadUrl = await this.fileService.generatePresignedDownloadUrl(
      file.objectKey,
    );
    return { ...file, downloadUrl };
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
