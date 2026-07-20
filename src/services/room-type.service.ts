import type { CategoryRepository } from "../repositories/category.repository";
import type { RoomTypeRepository } from "../repositories/room-type.repository";
import { ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

interface CreateRoomTypeInput {
  roomType: string;
}

interface ListRoomTypesInput {
  page: number;
  limit: number;
}

export class RoomTypeService {
  constructor(
    private readonly repo: RoomTypeRepository,
    private readonly categoryRepo: CategoryRepository,
  ) {}

  async createRoomType(input: CreateRoomTypeInput) {
    const created = await this.repo.create({
      roomType: input.roomType,
    });
    logger.info({ roomTypeId: created.id }, "room type created");
    return created;
  }

  async listRoomTypes(input: ListRoomTypesInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list(page, limit);
    const totalPages = Math.ceil(total / limit);
    return {
      data: rows,
      meta: { page, limit, total, totalPages },
    };
  }

  async deleteRoomType(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("room type not found");
    }

    const usedByCount = await this.categoryRepo.countActiveByRoomTypeId(id);
    if (usedByCount > 0) {
      throw new ConflictError(
        `room type is still used by ${usedByCount} category(s)`,
      );
    }

    await this.repo.softDelete(id);
    logger.info({ roomTypeId: id }, "room type deleted");
  }
}
