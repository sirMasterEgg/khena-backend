import type { ColorRepository } from "../repositories/color.repository";
import { NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

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
    return created;
  }

  async listColors(input: ListColorsInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list(page, limit);
    const totalPages = Math.ceil(total / limit);
    return {
      data: rows,
      meta: { page, limit, total, totalPages },
    };
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
    return updated;
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
