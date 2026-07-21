import type { ColorRepository } from "../repositories/color.repository";
import type { FinishRepository } from "../repositories/finish.repository";
import { ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";
import { toMediaResponseNullable } from "../utils/media-url";

interface CreateFinishInput {
  finish: string;
}

interface ListFinishesInput {
  page: number;
  limit: number;
}

interface FinishColor {
  id: string;
  name: string;
  hexCode: string;
  swatchPhoto: ReturnType<typeof toMediaResponseNullable>;
  notes: string | null;
}

export class FinishService {
  constructor(
    private readonly repo: FinishRepository,
    private readonly colorRepo: ColorRepository,
  ) {}

  async createFinish(input: CreateFinishInput) {
    const existing = await this.repo.findByName(input.finish);
    if (existing) {
      throw new ConflictError("finish already exists");
    }
    const created = await this.repo.create({
      name: input.finish,
    });
    logger.info({ finishId: created.id }, "finish created");
    return created;
  }

  async listFinishes(input: ListFinishesInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list(page, limit);

    // Ambil color untuk seluruh finish di halaman ini dalam satu query,
    // lalu gabungkan di memori supaya tidak N+1.
    const relatedColors = await this.colorRepo.findByFinishIds(
      rows.map((finish) => finish.id),
    );

    // Ambil seluruh media swatch untuk color di halaman ini dalam satu query.
    const swatchIds = relatedColors
      .map((color) => color.swatchPhoto)
      .filter((id): id is string => id !== null);
    const swatchMedia = await this.colorRepo.findMediaByIds(swatchIds);
    const swatchById = new Map(swatchMedia.map((m) => [m.id, m]));

    const colorsByFinishId = new Map<string, FinishColor[]>();
    for (const color of relatedColors) {
      if (!color.finishesId) {
        continue;
      }
      const bucket = colorsByFinishId.get(color.finishesId) ?? [];
      bucket.push({
        id: color.id,
        name: color.name,
        hexCode: color.hexCode,
        swatchPhoto: toMediaResponseNullable(
          color.swatchPhoto ? swatchById.get(color.swatchPhoto) : null,
        ),
        notes: color.notes,
      });
      colorsByFinishId.set(color.finishesId, bucket);
    }

    const totalPages = Math.ceil(total / limit);
    return {
      data: rows.map((finish) => ({
        ...finish,
        colors: colorsByFinishId.get(finish.id) ?? [],
      })),
      meta: { page, limit, total, totalPages },
    };
  }

  async deleteFinish(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("finish not found");
    }

    const usedByCount = await this.colorRepo.countActiveByFinishId(id);
    if (usedByCount > 0) {
      throw new ConflictError(
        `finish is still used by ${usedByCount} color(s)`,
      );
    }

    await this.repo.softDelete(id);
    logger.info({ finishId: id }, "finish deleted");
  }
}
