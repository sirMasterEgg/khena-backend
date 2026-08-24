import { fileTypeFromBuffer } from "file-type";
import type { NewPage, Page } from "../models/page.model";
import type { PageRepository } from "../repositories/page.repository";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { buildMediaUrl } from "../utils/media-url";
import type { FileService } from "./file.service";

const MAX_PAGE_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Hanya gambar — endpoint ini untuk konten halaman, bukan file manager umum.
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const FILE_PLACEHOLDER_PREFIX = "@file:";

// Batas kedalaman rekursi saat menelusuri JSON — penjaga supaya payload
// bersarang ekstrem tidak menghabiskan stack.
const MAX_JSON_DEPTH = 20;

interface PageFile {
  name: string;
  type: string;
  body: Buffer | Uint8Array;
}

interface CreatePageInput {
  page: string;
  section: string;
  data: string;
  status: string;
  files: PageFile[];
  fileKeys: string[];
}

type UpdatePageInput = Partial<CreatePageInput>;

interface ListPagesFilter {
  page?: string;
  section?: string;
  status?: string;
}

/**
 * Telusuri JSON dan ganti tiap string berbentuk "@file:<key>" dengan URL
 * hasil upload. `usedKeys` mencatat key yang benar-benar terpakai supaya
 * pemanggil bisa mendeteksi file yang dikirim tapi tidak pernah dirujuk.
 */
function resolvePlaceholders(
  value: unknown,
  urls: Map<string, string>,
  usedKeys: Set<string>,
  depth = 0,
): unknown {
  if (depth > MAX_JSON_DEPTH) {
    throw new BadRequestError("`data` is nested too deeply");
  }

  if (typeof value === "string") {
    if (!value.startsWith(FILE_PLACEHOLDER_PREFIX)) {
      return value;
    }
    const key = value.slice(FILE_PLACEHOLDER_PREFIX.length);
    const url = urls.get(key);
    if (!url) {
      throw new BadRequestError(`no file was uploaded for key "${key}"`);
    }
    usedKeys.add(key);
    return url;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      resolvePlaceholders(item, urls, usedKeys, depth + 1),
    );
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        resolvePlaceholders(v, urls, usedKeys, depth + 1),
      ]),
    );
  }

  return value; // number, boolean, null
}

/**
 * CRUD admin untuk konten CMS `pages`, termasuk upload gambar langsung di
 * dalam payload `data` lewat penanda "@file:<key>" (issue #100 §2).
 */
export class PageService {
  constructor(
    private readonly repo: PageRepository,
    private readonly fileService: FileService,
  ) {}

  private parseData(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      throw new BadRequestError("`data` is not valid JSON");
    }
  }

  private async uploadFiles(
    keys: string[],
    files: PageFile[],
  ): Promise<Map<string, string>> {
    // Jumlah key dan file harus sama persis — kalau tidak, pasangannya ambigu.
    if (keys.length !== files.length) {
      throw new BadRequestError(
        "`fileKeys` and `files` must have the same number of entries",
      );
    }

    const result = new Map<string, string>();
    for (const [index, file] of files.entries()) {
      const key = (keys[index] ?? "").trim();
      if (!key) {
        throw new BadRequestError(`file key at index ${index} is empty`);
      }
      if (result.has(key)) {
        throw new BadRequestError(`duplicate file key "${key}"`);
      }

      const body = Buffer.from(file.body);
      // File 0 byte kehilangan `name` saat di-parse Bun, jadi siapkan fallback
      // supaya pesan error tidak berbunyi "undefined".
      const fileName = file.name || "(unnamed)";

      if (body.byteLength === 0) {
        throw new BadRequestError(`file "${fileName}" is empty`);
      }
      if (body.byteLength > MAX_PAGE_IMAGE_BYTES) {
        throw new BadRequestError(
          `file "${fileName}" exceeds the maximum size of 5 MB`,
        );
      }

      // MIME dari klien tidak dipercaya — yang dipakai hasil deteksi isi file.
      const detected = await fileTypeFromBuffer(body);
      if (!detected || !ALLOWED_IMAGE_MIME.has(detected.mime)) {
        throw new BadRequestError(
          `file content of "${fileName}" is not a supported image type`,
        );
      }

      const uploaded = await this.fileService.uploadFile({
        fileName,
        contentType: detected.mime,
        body,
        folderPrefix: "pages",
      });
      result.set(key, buildMediaUrl(uploaded.objectKey));
    }
    return result;
  }

  /** Parse `data`, upload file, lalu ganti seluruh placeholder "@file:<key>" di dalamnya. */
  private async resolveData(
    rawData: string,
    fileKeys: string[],
    files: PageFile[],
  ): Promise<unknown> {
    const parsed = this.parseData(rawData);
    const urls = await this.uploadFiles(fileKeys, files);

    const usedKeys = new Set<string>();
    const resolved = resolvePlaceholders(parsed, urls, usedKeys);

    const unused = [...urls.keys()].filter((key) => !usedKeys.has(key));
    if (unused.length > 0) {
      throw new BadRequestError(
        `file key(s) not referenced in \`data\`: ${unused.join(", ")}`,
      );
    }

    return resolved;
  }

  async listPages(filter: ListPagesFilter): Promise<Page[]> {
    return await this.repo.list(filter);
  }

  async getPage(id: string): Promise<Page> {
    const page = await this.repo.findById(id);
    if (!page) {
      throw new NotFoundError("page not found");
    }
    return page;
  }

  async createPage(input: CreatePageInput): Promise<Page> {
    const page = input.page.trim();
    const section = input.section.trim();
    if (!page) {
      throw new BadRequestError("`page` must not be empty");
    }
    if (!section) {
      throw new BadRequestError("`section` must not be empty");
    }

    const resolved = await this.resolveData(
      input.data,
      input.fileKeys,
      input.files,
    );

    const existing = await this.repo.findByPageSection(page, section);
    if (existing) {
      throw new ConflictError("page section already exists");
    }

    const created = await this.repo.create({
      page,
      section,
      data: resolved,
      status: input.status,
    });

    logger.info({ pageId: created.id, page, section }, "page section created");
    return created;
  }

  async updatePage(id: string, input: UpdatePageInput): Promise<Page> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("page not found");
    }

    if (input.files && input.files.length > 0 && input.data === undefined) {
      throw new BadRequestError("`files` requires `data` to be sent as well");
    }

    const patch: Partial<NewPage> = {};

    if (input.page !== undefined) {
      const page = input.page.trim();
      if (!page) {
        throw new BadRequestError("`page` must not be empty");
      }
      patch.page = page;
    }
    if (input.section !== undefined) {
      const section = input.section.trim();
      if (!section) {
        throw new BadRequestError("`section` must not be empty");
      }
      patch.section = section;
    }
    if (input.status !== undefined) {
      patch.status = input.status;
    }
    if (input.data !== undefined) {
      // Hasilnya menggantikan seluruh isi kolom `data`, bukan di-merge.
      patch.data = await this.resolveData(
        input.data,
        input.fileKeys ?? [],
        input.files ?? [],
      );
    }

    const nextPage = patch.page ?? existing.page;
    const nextSection = patch.section ?? existing.section;
    if (nextPage !== existing.page || nextSection !== existing.section) {
      const conflict = await this.repo.findByPageSection(
        nextPage,
        nextSection,
        id,
      );
      if (conflict) {
        throw new ConflictError("page section already exists");
      }
    }

    // Body kosong → tidak ada yang perlu ditulis, jangan sentuh DB sama
    // sekali supaya updatedAt tidak ikut berubah tanpa alasan.
    if (Object.keys(patch).length === 0) {
      return existing;
    }

    const updated = await this.repo.update(id, patch);
    logger.info(
      { pageId: id, fields: Object.keys(patch) },
      "page section updated",
    );
    return updated;
  }
}
