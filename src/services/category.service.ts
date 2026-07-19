import type { CategoryRepository } from "../repositories/category.repository";
import type { RoomTypeRepository } from "../repositories/room-type.repository";
import { NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

type CategorySort = "name" | "displayOrder" | "roomType" | "createdAt";

const allowedSorts: CategorySort[] = [
  "name",
  "displayOrder",
  "roomType",
  "createdAt",
];

interface CreateCategoryInput {
  roomTypeId: string;
  category: string;
  order: number;
  status: string;
}

interface ListCategoriesInput {
  search?: string;
  status?: string;
  roomTypeId?: string;
  sort?: string;
  orderDir?: string;
  page: number;
  limit: number;
}

type UpdateCategoryInput = CreateCategoryInput;

export class CategoryService {
  constructor(
    private readonly categoryRepo: CategoryRepository,
    private readonly roomTypeRepo: RoomTypeRepository,
  ) {}

  async createCategory(input: CreateCategoryInput) {
    const roomType = await this.roomTypeRepo.findById(input.roomTypeId);
    if (!roomType) {
      throw new NotFoundError("room type not found");
    }
    const created = await this.categoryRepo.create({
      category: input.category,
      order: input.order,
      roomTypeId: input.roomTypeId,
      status: input.status,
    });
    logger.info({ categoryId: created.id }, "category created");
    return created;
  }

  async listCategories(input: ListCategoriesInput) {
    const sort = allowedSorts.includes(input.sort as CategorySort)
      ? (input.sort as CategorySort)
      : "createdAt";
    const orderDir = input.orderDir === "asc" ? "asc" : "desc";
    const { page, limit } = input;

    const { rows, total } = await this.categoryRepo.list({
      search: input.search,
      status: input.status,
      roomTypeId: input.roomTypeId,
      sort,
      orderDir,
      page,
      limit,
    });
    const totalPages = Math.ceil(total / limit);
    return {
      data: rows,
      meta: { page, limit, total, totalPages },
    };
  }

  async getCategoryDetail(id: string) {
    const category = await this.categoryRepo.findById(id);
    if (!category) {
      throw new NotFoundError("category not found");
    }
    const roomType = await this.roomTypeRepo.findById(category.roomTypeId);
    if (!roomType) {
      throw new NotFoundError("room type not found");
    }

    // Buang roomTypeId, ganti dengan objek roomType.
    const { roomTypeId: _roomTypeId, ...rest } = category;
    return {
      ...rest,
      roomType: { id: roomType.id, roomType: roomType.roomType },
    };
  }

  async getCategoryStats() {
    const stats = await this.categoryRepo.stats();
    return {
      totalCategories: stats.total,
      publishedCategories: stats.published,
      draftCategories: stats.draft,
      roomGroups: stats.roomGroups,
    };
  }

  async updateCategory(id: string, input: UpdateCategoryInput) {
    const existing = await this.categoryRepo.findById(id);
    if (!existing) {
      throw new NotFoundError("category not found");
    }
    const roomType = await this.roomTypeRepo.findById(input.roomTypeId);
    if (!roomType) {
      throw new NotFoundError("room type not found");
    }
    const updated = await this.categoryRepo.update(id, {
      category: input.category,
      order: input.order,
      roomTypeId: input.roomTypeId,
      status: input.status,
    });
    logger.info({ categoryId: id }, "category updated");
    return updated;
  }

  async deleteCategory(id: string) {
    const existing = await this.categoryRepo.findById(id);
    if (!existing) {
      throw new NotFoundError("category not found");
    }
    await this.categoryRepo.softDelete(id);
    logger.info({ categoryId: id }, "category deleted");
  }
}
