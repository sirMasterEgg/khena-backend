import { fileTypeFromBuffer } from "file-type";
import {
  formatBytes,
  MAX_DIRECT_UPLOAD_BYTES,
  MAX_MULTIPART_UPLOAD_BYTES,
} from "../config/upload.config";
import type { NewMedia } from "../models/media.model";
import type {
  MediaListFilter,
  MediaRepository,
} from "../repositories/media.repository";
import { db } from "../utils/db";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { buildMediaUrl } from "../utils/media-url";
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
  altText?: string | null;
}

interface UpdateFolderInput {
  path: string;
  folderName: string;
}

/**
 * Body PATCH file: semua field opsional. Field yang tidak dikirim
 * (`undefined`) tidak diubah nilainya di DB.
 */
interface PatchFileInput {
  path?: string;
  file?: Partial<UploadFileInput>;
}

interface UploadDirectFile {
  name: string;
  type: string;
  body: Buffer | Uint8Array;
  altText?: string | null;
}

interface UploadDirectInput {
  path: string;
  files: UploadDirectFile[];
}

interface InitMultipartInput {
  path: string;
  file: UploadFileInput;
}

/** Query params untuk browse media (filter + sort). */
export type BrowseFilter = Omit<MediaListFilter, "folderId">;

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

/**
 * MIME type yang boleh diupload. Selain ini ditolak — daftar putih, bukan
 * daftar hitam, supaya format baru harus disetujui secara sadar.
 */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "video/mp4",
]);

/**
 * Pastikan isi file benar-benar sesuai tipe yang diklaim klien. MIME dan nama
 * file dari klien tidak bisa dipercaya, jadi yang dipakai untuk menyimpan
 * adalah hasil deteksi dari isi file.
 */
async function verifyFileContent(
  fileName: string,
  claimedType: string,
  body: Buffer | Uint8Array,
) {
  const detected = await fileTypeFromBuffer(body);
  if (!detected) {
    throw new BadRequestError(
      `file content of "${fileName}" is not a supported file type`,
    );
  }
  if (!ALLOWED_MIME_TYPES.has(detected.mime)) {
    throw new BadRequestError(`file type "${detected.mime}" is not allowed`);
  }
  // Browser bisa mengirim image/jpg maupun image/jpeg untuk file yang sama,
  // jadi yang dibandingkan cukup kategori besarnya.
  const claimedCategory = claimedType.split("/")[0];
  const detectedCategory = detected.mime.split("/")[0];
  if (claimedCategory !== detectedCategory) {
    throw new BadRequestError(
      `file "${fileName}" claims to be ${claimedType} but its content is ${detected.mime}`,
    );
  }
  return detected;
}

/** Extract a lowercase extension (without dot) from a file name. */
function extractExtension(fileName: string): string | null {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return null;
  }
  return fileName.slice(lastDot + 1).toLowerCase();
}

/** String kosong / whitespace dianggap "tidak diisi" → null. */
function normalizeAltText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
      throw new NotFoundError("folder not found");
    }
    return folder.id;
  }

  async createFolder(input: CreateFolderInput) {
    const parentPath = normalizePath(input.path);

    let parentId: string | null = null;
    if (!isRootPath(parentPath)) {
      const parent = await this.repo.findFolderByPath(parentPath);
      if (!parent) {
        throw new NotFoundError("parent folder not found");
      }
      parentId = parent.id;
    }

    const newPath = joinPath(parentPath, input.folderName);

    const existing = await this.repo.findFolderByPath(newPath);
    if (existing) {
      throw new ConflictError("folder already exists");
    }

    const created = await this.repo.createFolder({
      name: sanitizeName(input.folderName),
      parentId,
      path: newPath,
    });
    logger.info(
      { folderId: created.id, path: newPath },
      "media folder created",
    );
    return created;
  }

  async uploadDirect(input: UploadDirectInput) {
    const path = normalizePath(input.path);
    const folderId = await this.resolveFolderId(path);
    const folderPrefix = isRootPath(path) ? undefined : path.slice(1);

    const results = [];
    for (const file of input.files) {
      // File kosong dicek paling awal: tidak punya signature apa pun, jadi
      // verifikasi tipe di bawah tidak akan memberi pesan yang berguna.
      if (file.body.byteLength === 0) {
        throw new BadRequestError(`file "${file.name}" is empty`);
      }

      if (file.body.byteLength > MAX_DIRECT_UPLOAD_BYTES) {
        throw new BadRequestError(
          `file "${file.name}" exceeds the maximum size of ${formatBytes(MAX_DIRECT_UPLOAD_BYTES)}`,
        );
      }

      const detected = await verifyFileContent(file.name, file.type, file.body);

      const uploaded = await this.fileService.uploadFile({
        fileName: file.name,
        contentType: detected.mime,
        body: file.body,
        folderPrefix,
      });

      const created = await this.repo.createMedia({
        folderId,
        name: sanitizeName(file.name),
        originalName: file.name,
        type: deriveType(detected.mime),
        mimeType: detected.mime,
        extension: detected.ext,
        sizeBytes: file.body.byteLength,
        storageProvider: uploaded.provider,
        bucket: uploaded.bucket,
        objectKey: uploaded.objectKey,
        status: "ready",
        altText: normalizeAltText(file.altText),
      });

      results.push({
        mediaId: created.id,
        fileName: file.name,
        objectKey: uploaded.objectKey,
        url: buildMediaUrl(uploaded.objectKey),
        altText: created.altText,
      });
    }

    logger.info(
      { folderId, fileCount: results.length },
      "media files uploaded",
    );
    return results;
  }

  async initMultipart(input: InitMultipartInput) {
    if (input.file.size <= 0) {
      throw new BadRequestError(`file "${input.file.name}" is empty`);
    }

    if (input.file.size > MAX_MULTIPART_UPLOAD_BYTES) {
      throw new BadRequestError(
        `file "${input.file.name}" exceeds the maximum size of ${formatBytes(MAX_MULTIPART_UPLOAD_BYTES)}`,
      );
    }

    // Isi file belum ada di tahap ini (klien baru mengumumkan niatnya), jadi
    // yang bisa dicek baru MIME yang diklaim. Verifikasi isi sesungguhnya
    // dilakukan saat part pertama masuk.
    if (!ALLOWED_MIME_TYPES.has(input.file.type)) {
      throw new BadRequestError(
        `file type "${input.file.type}" is not allowed`,
      );
    }

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
      altText: normalizeAltText(input.file.altText),
    });

    return {
      mediaId: created.id,
      uploadId: init.uploadId,
      objectKey: init.objectKey,
      url: buildMediaUrl(init.objectKey),
      partSize: init.partSize,
      partCount: init.partCount,
    };
  }

  async uploadMultipartPart(input: UploadPartInput) {
    const file = await this.repo.findMediaById(input.mediaId);
    if (!file) {
      throw new NotFoundError("media not found");
    }

    // Signature file selalu ada di byte-byte awal, jadi cukup part pertama
    // yang perlu diperiksa. Kalau gagal, klien membatalkan lewat endpoint
    // `abort` yang sudah ada.
    if (input.partNumber === 1) {
      await verifyFileContent(file.name, file.mimeType ?? "", input.body);
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
      throw new NotFoundError("media not found");
    }

    // objectKey is taken from the DB, never trusted from the client.
    await this.fileService.completeMultipartUpload(
      file.objectKey,
      input.uploadId,
      input.parts,
    );

    const metadata = await this.fileService.getFileMetadata(file.objectKey);

    // Ukuran di init hanya klaim klien; yang ini ukuran sebenarnya di storage.
    if (metadata.sizeBytes > MAX_MULTIPART_UPLOAD_BYTES) {
      await this.fileService.deleteFile(file.objectKey);
      await this.repo.softDeleteMedia(file.id);
      throw new BadRequestError(
        `uploaded file exceeds the maximum size of ${formatBytes(MAX_MULTIPART_UPLOAD_BYTES)}`,
      );
    }

    const updated = await this.repo.updateMedia(file.id, {
      status: "ready",
      sizeBytes: metadata.sizeBytes || file.sizeBytes,
      mimeType: metadata.contentType ?? file.mimeType,
    });
    logger.info(
      { mediaId: file.id, sizeBytes: updated.sizeBytes },
      "media multipart upload completed",
    );
    return updated;
  }

  async abortMultipart(input: AbortMultipartInput) {
    const file = await this.repo.findMediaById(input.mediaId);
    if (!file) {
      throw new NotFoundError("media not found");
    }

    await this.fileService.abortMultipartUpload(file.objectKey, input.uploadId);
    await this.repo.softDeleteMedia(file.id);

    logger.info({ mediaId: file.id }, "media multipart upload aborted");
    return { success: true };
  }

  async browse(rawPath: string, filter: BrowseFilter) {
    const path = normalizePath(rawPath);

    let folderId: string | null = null;
    if (!isRootPath(path)) {
      const folder = await this.repo.findFolderByPath(path);
      if (!folder) {
        throw new NotFoundError("folder not found");
      }
      folderId = folder.id;
    }

    const [subFolders, files] = await Promise.all([
      this.repo.findSubFolders(folderId),
      this.repo.findMediaByFolderId({ ...filter, folderId }),
    ]);

    return { path, folders: subFolders, files };
  }

  async getFile(id: string) {
    const file = await this.repo.findMediaById(id);
    if (!file) {
      throw new NotFoundError("file not found");
    }
    return file;
  }

  /** Stream a file's bytes through the server (no presigned URL). */
  async downloadFile(id: string) {
    const file = await this.repo.findMediaById(id);
    if (!file) {
      throw new NotFoundError("file not found");
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
    const updated = await db.transaction(async (tx) => {
      const folder = await this.repo.findFolderById(id);
      if (!folder) {
        throw new NotFoundError("folder not found");
      }

      const parentPath = normalizePath(input.path);
      let parentId: string | null = null;
      if (!isRootPath(parentPath)) {
        const parent = await this.repo.findFolderByPath(parentPath);
        if (!parent) {
          throw new NotFoundError("parent folder not found");
        }
        if (parent.id === folder.id) {
          throw new BadRequestError("folder cannot be its own parent");
        }
        parentId = parent.id;
      }

      const oldPath = folder.path;
      const newPath = joinPath(parentPath, input.folderName);

      if (newPath !== oldPath) {
        const existing = await this.repo.findFolderByPath(newPath);
        if (existing) {
          throw new ConflictError("folder already exists");
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

    logger.info({ folderId: id, path: updated.path }, "media folder updated");
    return updated;
  }

  /**
   * Update sebagian metadata file. Hanya field yang benar-benar dikirim
   * client yang ikut ditulis ke DB — sisanya dibiarkan apa adanya.
   */
  async updateFile(id: string, input: PatchFileInput) {
    const file = await this.repo.findMediaById(id);
    if (!file) {
      throw new NotFoundError("file not found");
    }

    const patch: Partial<NewMedia> = {};

    if (input.path !== undefined) {
      patch.folderId = await this.resolveFolderId(input.path);
    }

    const fileInput = input.file;
    if (fileInput) {
      // `name` ikut menentukan originalName & extension, jadi ketiganya
      // diperbarui bersamaan supaya tidak jadi tidak konsisten.
      if (fileInput.name !== undefined) {
        patch.name = sanitizeName(fileInput.name);
        patch.originalName = fileInput.name;
        patch.extension = extractExtension(fileInput.name);
      }
      // Sama halnya `type`: kategori media diturunkan dari mime type. Isi file
      // tidak ikut berubah lewat PATCH, jadi minimal batasi ke daftar izin
      // supaya tidak bisa diubah jadi tipe sembarangan.
      if (fileInput.type !== undefined) {
        if (!ALLOWED_MIME_TYPES.has(fileInput.type)) {
          throw new BadRequestError(
            `file type "${fileInput.type}" is not allowed`,
          );
        }
        patch.type = deriveType(fileInput.type);
        patch.mimeType = fileInput.type;
      }
      if (fileInput.size !== undefined) {
        patch.sizeBytes = fileInput.size;
      }
      if (fileInput.altText !== undefined) {
        patch.altText = normalizeAltText(fileInput.altText);
      }
    }

    // Body kosong → tidak ada yang perlu ditulis, jangan sentuh DB sama
    // sekali supaya updatedAt tidak ikut berubah tanpa alasan.
    if (Object.keys(patch).length === 0) {
      return file;
    }

    const updated = await this.repo.updateMedia(id, patch);
    logger.info(
      { mediaId: id, fields: Object.keys(patch) },
      "media file updated",
    );
    return updated;
  }

  /**
   * Ubah objectKey (lokasi fisik file di S3) sebuah media. Objek dipindahkan
   * di storage lebih dulu (copy → delete), baru kolom DB diperbarui, sehingga
   * bila move gagal, DB tidak ikut berubah.
   */
  async updateObjectKey(id: string, newObjectKey: string) {
    const file = await this.repo.findMediaById(id);
    if (!file) {
      throw new NotFoundError("file not found");
    }

    const sanitized = newObjectKey.trim();
    if (
      sanitized.length === 0 ||
      sanitized.includes("..") ||
      sanitized.startsWith("/")
    ) {
      throw new BadRequestError("invalid object key");
    }

    // Tanpa perubahan → kembalikan apa adanya tanpa menyentuh storage.
    if (sanitized === file.objectKey) {
      return file;
    }

    const existing = await this.repo.findMediaByObjectKey(sanitized);
    if (existing) {
      throw new ConflictError("object key already in use");
    }

    // Pindahkan objek dulu; kalau gagal, DB tidak diubah.
    await this.fileService.moveFile(file.objectKey, sanitized);

    const updated = await this.repo.updateMedia(id, { objectKey: sanitized });
    logger.info(
      { mediaId: id, oldObjectKey: file.objectKey, newObjectKey: sanitized },
      "media object key updated",
    );
    return updated;
  }

  async deleteFolder(id: string) {
    const deletedFolderCount = await db.transaction(async (tx) => {
      const folder = await this.repo.findFolderById(id);
      if (!folder) {
        throw new NotFoundError("folder not found");
      }

      // Cascade: target folder + all descendants, plus media inside them.
      const subtree = await this.repo.findFolderSubtree(folder.path);
      const folderIds = subtree.map((f) => f.id);

      await this.repo.softDeleteMediaByFolderIds(folderIds, tx);
      await this.repo.softDeleteFolders(folderIds, tx);

      return folderIds.length;
    });

    logger.info({ folderId: id, deletedFolderCount }, "media folder deleted");
    return { success: true };
  }

  /**
   * Hapus file secara soft delete saja. Objek fisik di storage sengaja
   * TIDAK dihapus supaya masih bisa dipulihkan dan supaya URL lama tidak
   * langsung mati. Pembersihan objek yatim (kalau nanti diperlukan)
   * dilakukan terpisah, bukan di jalur request user.
   */
  async deleteFile(id: string) {
    const file = await this.repo.findMediaById(id);
    if (!file) {
      throw new NotFoundError("file not found");
    }

    await this.repo.softDeleteMedia(file.id);

    logger.info({ mediaId: file.id }, "media file deleted");
    return { success: true };
  }
}
