import type { Color } from "../models/color.model";
import type { ColorRepository } from "../repositories/color.repository";
import { NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { toMediaResponseNullable } from "../utils/media-url";

interface CreateColorInput {
  color: string;
  hex: string;
  finishId: string;
  notes?: string;
  swatchImage?: string;
}

interface ListColorsInput {
  page: number;
  limit: number;
}

type UpdateColorInput = CreateColorInput;

export class ColorService {
  constructor(private readonly repo: ColorRepository) {}

  private async validateFinish(finishId: string) {
    const finish = await this.repo.findFinishById(finishId);
    if (!finish) {
      throw new NotFoundError("finish not found");
    }
  }

  private async validateSwatch(swatchImage?: string) {
    if (!swatchImage) {
      return;
    }
    const found = await this.repo.findMediaById(swatchImage);
    if (!found) {
      throw new NotFoundError("swatch media not found");
    }
  }

  /** Ubah satu row color jadi bentuk response (swatchPhoto → objek media). */
  private async toResponse(row: Color) {
    const [mapped] = await this.toResponseList([row]);
    if (!mapped) {
      throw new Error("failed to map color response");
    }
    return mapped;
  }

  /**
   * Versi batch: ambil seluruh media swatch dalam satu query,
   * lalu gabungkan di memori supaya tidak N+1.
   */
  private async toResponseList(rows: Color[]) {
    const mediaIds = rows
      .map((row) => row.swatchPhoto)
      .filter((id): id is string => id !== null);
    const finishIds = rows
      .map((row) => row.finishesId)
      .filter((id): id is string => id !== null);

    const [mediaRows, finishRows] = await Promise.all([
      this.repo.findMediaByIds(mediaIds),
      this.repo.findFinishByIds(finishIds),
    ]);
    const mediaById = new Map(mediaRows.map((m) => [m.id, m]));
    const finishById = new Map(finishRows.map((f) => [f.id, f]));

    // Media / finish yang sudah soft-deleted tidak ketemu di Map → `null`,
    // bukan error.
    return rows.map((row) => {
      const finish = row.finishesId ? finishById.get(row.finishesId) : null;
      return {
        ...row,
        swatchPhoto: toMediaResponseNullable(
          row.swatchPhoto ? mediaById.get(row.swatchPhoto) : null,
        ),
        finishes: finish ?? null,
      };
    });
  }

  async createColor(input: CreateColorInput) {
    await this.validateFinish(input.finishId);
    await this.validateSwatch(input.swatchImage);

    const created = await this.repo.create({
      name: input.color,
      hexCode: input.hex,
      finishesId: input.finishId,
      notes: input.notes,
      swatchPhoto: input.swatchImage,
    });
    logger.info({ colorId: created.id }, "color created");
    return await this.toResponse(created);
  }

  async listColors(input: ListColorsInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list(page, limit);
    const totalPages = Math.ceil(total / limit);
    return {
      data: await this.toResponseList(rows),
      meta: { page, limit, total, totalPages },
    };
  }

  async getColorById(id: string) {
    const color = await this.repo.findById(id);
    if (!color) {
      throw new NotFoundError("color not found");
    }
    return await this.toResponse(color);
  }

  async updateColor(id: string, input: UpdateColorInput) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("color not found");
    }
    await this.validateFinish(input.finishId);
    await this.validateSwatch(input.swatchImage);

    const updated = await this.repo.update(id, {
      name: input.color,
      hexCode: input.hex,
      finishesId: input.finishId,
      notes: input.notes,
      swatchPhoto: input.swatchImage,
    });
    logger.info({ colorId: id }, "color updated");
    return await this.toResponse(updated);
  }

  async deleteColor(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("color not found");
    }
    await this.repo.softDelete(id);
    logger.info({ colorId: id }, "color deleted");
  }
}
