import { fileTypeFromBuffer } from "file-type";
import type { ExternalAttachmentRepository } from "../repositories/public/external-attachment.repository";
import { BadRequestError } from "../utils/errors";
import type { FileService } from "./file.service";

const MAX_PUBLIC_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

interface PublicAttachmentFile {
  name: string;
  type: string;
  body: Buffer | Uint8Array;
}

/**
 * Validasi + upload attachment untuk endpoint publik (POST /inquiries,
 * POST /careers/apply). Lihat issue #98 §6.4.
 */
export class PublicAttachmentService {
  constructor(
    private readonly fileService: FileService,
    private readonly repo: ExternalAttachmentRepository,
  ) {}

  async upload(
    file: PublicAttachmentFile,
    folderPrefix: "inquiries" | "applicants",
  ): Promise<string> {
    if (file.body.byteLength > MAX_PUBLIC_ATTACHMENT_BYTES) {
      throw new BadRequestError(
        `file "${file.name}" exceeds the maximum size of 5 MB`,
      );
    }

    const detected = await fileTypeFromBuffer(file.body);
    // ".doc" lama sering terbaca sebagai "application/x-cfb" (format
    // container OLE2), bukan mime Word yang spesifik. Diterima hanya kalau
    // ekstensi nama file memang ".doc" — supaya PDF/ZIP lain yang kebetulan
    // juga OLE2-based tidak ikut lolos.
    const isLegacyDoc =
      detected?.mime === "application/x-cfb" &&
      file.name.toLowerCase().endsWith(".doc");

    if (!detected || (!ALLOWED_MIME.has(detected.mime) && !isLegacyDoc)) {
      throw new BadRequestError(
        `file content of "${file.name}" is not a supported file type`,
      );
    }

    const uploaded = await this.fileService.uploadFile({
      fileName: file.name,
      contentType: isLegacyDoc ? "application/msword" : detected.mime,
      body: file.body,
      folderPrefix,
    });

    const created = await this.repo.create({
      objectKey: uploaded.objectKey,
      storageProvider: uploaded.provider,
      bucket: uploaded.bucket,
    });
    return created.id;
  }
}
