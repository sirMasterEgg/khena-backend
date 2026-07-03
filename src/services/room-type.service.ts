import type { RoomTypeRepository } from "../repositories/room-type.repository";
import { NotFoundError } from "../utils/errors";

interface CreateRoomTypeInput {
  roomType: string;
}

interface ListRoomTypesInput {
  page: number;
  limit: number;
}

export class RoomTypeService {
  constructor(private readonly repo: RoomTypeRepository) {}

  async createRoomType(input: CreateRoomTypeInput) {
    return await this.repo.create({ roomType: input.roomType });
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
    await this.repo.softDelete(id);
  }
}
