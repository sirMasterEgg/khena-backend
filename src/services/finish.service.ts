import type { FinishRepository } from "../repositories/finish.repository";
import { ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

interface CreateFinishInput {
  finish: string;
}

interface ListFinishesInput {
  page: number;
  limit: number;
}

export class FinishService {
  constructor(private readonly repo: FinishRepository) {}

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
    const totalPages = Math.ceil(total / limit);
    return {
      data: rows,
      meta: { page, limit, total, totalPages },
    };
  }

  async deleteFinish(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("finish not found");
    }
    await this.repo.softDelete(id);
    logger.info({ finishId: id }, "finish deleted");
  }
}
