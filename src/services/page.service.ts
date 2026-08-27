import { fileTypeFromBuffer } from "file-type";
import type { NewPage, Page } from "../models/page.model";
import type { PageRepository } from "../repositories/page.repository";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { buildMediaUrl, objectKeyFromUrl } from "../utils/media-url";
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

// Seluruh gambar milik modul ini disimpan di bawah prefix ini. Dipakai dua
// arah: saat upload, dan saat memutuskan apakah sebuah file boleh dihapus.
const PAGE_FOLDER_PREFIX = "pages";

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
 * Kumpulkan objectKey milik modul ini (prefix "pages/") dari seluruh string
 * URL di dalam JSON. Dipakai untuk membandingkan gambar lama vs gambar baru.
 *
 * Beda dari `resolvePlaceholders`, fungsi ini diam saja saat kedalaman habis:
 * sumbernya bisa berupa `data` yang sudah tersimpan di DB, dan gagal
 * membersihkan file lebih baik daripada menggagalkan request.
 */
function collectPageObjectKeys(
  value: unknown,
  into: Set<string>,
  depth = 0,
): void {
  if (depth > MAX_JSON_DEPTH) {
    return;
  }

  if (typeof value === "string") {
    const key = objectKeyFromUrl(value);
    if (key?.startsWith(`${PAGE_FOLDER_PREFIX}/`)) {
      into.add(key);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPageObjectKeys(item, into, depth + 1);
    }
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectPageObjectKeys(item, into, depth + 1);
    }
  }
}

/**
 * CRUD admin untuk konten CMS `pages`, termasuk upload gambar langsung di
 * dalam payload `data` lewat penanda "@file:<key>" (issue #100 §2).
 *
 * Gambar di modul ini tidak dicatat di tabel `media`, jadi siklus hidupnya
 * ditentukan sepenuhnya oleh isi kolom `data`: file yang tidak lagi dirujuk
 * setelah PATCH dihapus dari storage, begitu juga file yang terlanjur naik
 * pada request yang akhirnya ditolak.
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
    uploadedKeys: string[],
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
        folderPrefix: PAGE_FOLDER_PREFIX,
      });
      // Dicatat segera setelah naik: kalau file berikutnya gagal validasi,
      // yang ini harus ikut dibuang.
      uploadedKeys.push(uploaded.objectKey);
      result.set(key, buildMediaUrl(uploaded.objectKey));
    }
    return result;
  }

  /**
   * Parse `data`, upload file, lalu ganti seluruh placeholder "@file:<key>".
   * `uploadedKeys` berisi objectKey yang berhasil naik — pemanggil wajib
   * membuangnya lewat `discardUploads` kalau request gagal sebelum tersimpan.
   */
  private async resolveData(
    rawData: string,
    fileKeys: string[],
    files: PageFile[],
  ): Promise<{ resolved: unknown; uploadedKeys: string[] }> {
    const parsed = this.parseData(rawData);
    const uploadedKeys: string[] = [];

    try {
      const urls = await this.uploadFiles(fileKeys, files, uploadedKeys);

      const usedKeys = new Set<string>();
      const resolved = resolvePlaceholders(parsed, urls, usedKeys);

      const unused = [...urls.keys()].filter((key) => !usedKeys.has(key));
      if (unused.length > 0) {
        throw new BadRequestError(
          `file key(s) not referenced in \`data\`: ${unused.join(", ")}`,
        );
      }

      return { resolved, uploadedKeys };
    } catch (err) {
      // Validasi gagal setelah sebagian file terlanjur naik — buang lagi
      // supaya request yang ditolak tidak meninggalkan file yatim.
      await this.discardUploads(uploadedKeys);
      throw err;
    }
  }

  /**
   * Buang file yang terlanjur ter-upload pada request yang gagal. Best effort:
   * kegagalan storage hanya di-log supaya tidak menutupi error asli yang
   * sedang dilempar.
   */
  private async discardUploads(objectKeys: string[]): Promise<void> {
    for (const objectKey of objectKeys) {
      try {
        await this.fileService.deleteFile(objectKey);
      } catch (err) {
        logger.warn({ err, objectKey }, "failed to discard uploaded page file");
      }
    }
  }

  /**
   * Hapus gambar yang tidak lagi dirujuk `data` setelah PATCH berhasil —
   * inilah yang membuat "ganti gambar" dan "hapus gambar" tidak menyisakan
   * file yatim. Dua penjaga sebelum sebuah file benar-benar dihapus:
   *
   * 1. Key masih dipakai section lain → biarkan.
   * 2. Key tercatat di tabel `media` → itu file Media Library yang URL-nya
   *    kebetulan ditempel ke `data`, bukan milik modul ini → biarkan.
   */
  private async deleteUnreferencedFiles(
    pageId: string,
    oldData: unknown,
    newData: unknown,
  ): Promise<void> {
    const oldKeys = new Set<string>();
    collectPageObjectKeys(oldData, oldKeys);
    const newKeys = new Set<string>();
    collectPageObjectKeys(newData, newKeys);

    const candidates = [...oldKeys].filter((key) => !newKeys.has(key));
    if (candidates.length === 0) {
      return;
    }

    const stillUsed = new Set<string>();
    for (const data of await this.repo.listDataExcept(pageId)) {
      collectPageObjectKeys(data, stillUsed);
    }
    for (const key of await this.repo.findMediaObjectKeys(candidates)) {
      stillUsed.add(key);
    }

    for (const objectKey of candidates) {
      if (stillUsed.has(objectKey)) {
        continue;
      }
      try {
        await this.fileService.deleteFile(objectKey);
      } catch (err) {
        // Baris DB sudah tersimpan dan itu sumber kebenarannya; kegagalan
        // hapus file tidak boleh menggagalkan request. Key ikut di-log supaya
        // sisanya bisa dibereskan manual.
        logger.warn(
          { err, pageId, objectKey },
          "failed to delete unreferenced page file",
        );
      }
    }
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

    // Cek duplikat sebelum upload supaya kasus 409 tidak perlu menaikkan file
    // sama sekali. Insert tetap dibungkus try/catch untuk sisa kasusnya.
    const existing = await this.repo.findByPageSection(page, section);
    if (existing) {
      throw new ConflictError("page section already exists");
    }

    const { resolved, uploadedKeys } = await this.resolveData(
      input.data,
      input.fileKeys,
      input.files,
    );

    let created: Page;
    try {
      created = await this.repo.create({
        page,
        section,
        data: resolved,
        status: input.status,
      });
    } catch (err) {
      await this.discardUploads(uploadedKeys);
      throw err;
    }

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

    // Semua pemeriksaan yang tidak menyentuh storage dijalankan lebih dulu,
    // supaya request yang pasti ditolak tidak sempat menaikkan file.
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
    if (input.data === undefined && Object.keys(patch).length === 0) {
      return existing;
    }

    let uploadedKeys: string[] = [];
    if (input.data !== undefined) {
      // Hasilnya menggantikan seluruh isi kolom `data`, bukan di-merge.
      const result = await this.resolveData(
        input.data,
        input.fileKeys ?? [],
        input.files ?? [],
      );
      patch.data = result.resolved;
      uploadedKeys = result.uploadedKeys;
    }

    let updated: Page;
    try {
      updated = await this.repo.update(id, patch);
    } catch (err) {
      await this.discardUploads(uploadedKeys);
      throw err;
    }

    // Baru setelah `data` yang baru aman tersimpan, gambar lama yang tidak
    // lagi dirujuk boleh dibuang.
    if (input.data !== undefined) {
      await this.deleteUnreferencedFiles(id, existing.data, patch.data);
    }

    logger.info(
      { pageId: id, fields: Object.keys(patch) },
      "page section updated",
    );
    return updated;
  }
}
