import type { Discount, NewDiscount } from "../models/discount.model";
import type {
  DiscountListRow,
  DiscountRepository,
  EntityTargetType,
} from "../repositories/discount.repository";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

/** Tipe sasaran yang menunjuk sebuah baris di tabel lain (butuh appliesToId). */
const ENTITY_TARGET_TYPES = [
  "collection",
  "product",
  "category",
  "customer",
] as const;

/** Tipe sasaran berupa aturan/scope, tidak menunjuk baris mana pun. */
const SCOPE_TARGET_TYPES = [
  "all_products",
  "vip_customer",
  "newsletter_subscribers",
  "orders_over_10_million",
] as const;

type ScopeTargetType = (typeof SCOPE_TARGET_TYPES)[number];
type AppliesToType = EntityTargetType | ScopeTargetType;

function isEntityTarget(type: AppliesToType): type is EntityTargetType {
  return (ENTITY_TARGET_TYPES as readonly string[]).includes(type);
}

/**
 * Status yang disimpan hanya active/inactive. scheduled/expired dihitung dari
 * tanggal setiap kali data dibaca — lihat bagian 3.1 issue #71.
 */
function resolveStatus(
  row: { status: string; startDate: Date; endDate: Date },
  now: Date,
): "inactive" | "scheduled" | "expired" | "active" {
  if (row.status === "inactive") return "inactive";
  if (now < row.startDate) return "scheduled";
  if (now > row.endDate) return "expired";
  return "active";
}

interface DiscountRuleInput {
  discountType: string;
  discountValue: number;
  startDate: Date;
  endDate: Date;
}

/** Aturan 3-6: berlaku untuk create maupun update (terhadap nilai hasil merge). */
function validateDiscountRules(input: DiscountRuleInput): number {
  if (input.endDate <= input.startDate) {
    throw new BadRequestError("end date must be after start date");
  }
  if (input.discountType === "percentage") {
    if (input.discountValue < 1 || input.discountValue > 100) {
      throw new BadRequestError("percentage value must be between 1 and 100");
    }
    return input.discountValue;
  }
  if (input.discountType === "fixed_amount") {
    if (input.discountValue < 1) {
      throw new BadRequestError("fixed amount value must be greater than 0");
    }
    return input.discountValue;
  }
  // free_shipping: paksa 0, jangan tolak.
  return 0;
}

interface CreateDiscountInput {
  code: string;
  discountType: string;
  discountValue: number;
  appliesToType: AppliesToType;
  appliesToId?: string | null;
  startDate: string;
  endDate: string;
  usageLimit?: number | null;
  status: "active" | "inactive";
}

interface UpdateDiscountInput {
  code?: string;
  discountType?: string;
  discountValue?: number;
  appliesToType?: AppliesToType;
  appliesToId?: string | null;
  startDate?: string;
  endDate?: string;
  usageLimit?: number | null;
  status?: "active" | "inactive";
}

interface ListDiscountsInput {
  search?: string;
  status?: "active" | "inactive" | "scheduled" | "expired";
  page: number;
  limit: number;
}

export class DiscountService {
  constructor(private readonly repo: DiscountRepository) {}

  private async resolveTarget(
    type: AppliesToType,
    id: string | null | undefined,
  ): Promise<string | null> {
    if (!isEntityTarget(type)) {
      if (id) {
        throw new BadRequestError(
          "applies_to_id is not allowed for this target type",
        );
      }
      return null;
    }

    if (!id) {
      throw new BadRequestError(
        "applies_to_id is required for this target type",
      );
    }

    const name = await this.repo.findTargetName(type, id);
    if (name === null) {
      throw new NotFoundError(`${type} not found`);
    }
    return id;
  }

  private async toResponse(
    row: Discount,
    now: Date,
    targetName: string | null,
  ) {
    return {
      id: row.id,
      code: row.code,
      discountType: row.discountType,
      discountValue: row.discountValue,
      appliesToType: row.appliesToType,
      appliesToId: row.appliesToId,
      targetName,
      startDate: row.startDate,
      endDate: row.endDate,
      usageLimit: row.usageLimit,
      used: await this.repo.countUsage(row.id),
      status: resolveStatus(row, now),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      deletedBy: row.deletedBy,
    };
  }

  private toListItemResponse(row: DiscountListRow, now: Date) {
    return {
      id: row.id,
      code: row.code,
      discountType: row.discountType,
      discountValue: row.discountValue,
      appliesToType: row.appliesToType,
      appliesToId: row.appliesToId,
      startDate: row.startDate,
      endDate: row.endDate,
      used: row.used,
      usageLimit: row.usageLimit,
      status: resolveStatus(row, now),
    };
  }

  async createDiscount(input: CreateDiscountInput) {
    const now = new Date();
    const code = input.code.trim().toUpperCase();

    const existing = await this.repo.findByCode(code);
    if (existing) {
      throw new ConflictError("discount code already exists");
    }

    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    const discountValue = validateDiscountRules({
      discountType: input.discountType,
      discountValue: input.discountValue,
      startDate,
      endDate,
    });

    const appliesToId = await this.resolveTarget(
      input.appliesToType,
      input.appliesToId,
    );

    const data: NewDiscount = {
      code,
      discountType: input.discountType,
      discountValue,
      appliesToType: input.appliesToType,
      appliesToId,
      startDate,
      endDate,
      usageLimit: input.usageLimit ?? null,
      status: input.status,
    };

    const created = await this.repo.create(data);
    logger.info({ discountId: created.id }, "discount created");

    const targetName = isEntityTarget(input.appliesToType)
      ? await this.repo.findTargetName(
          input.appliesToType,
          appliesToId as string,
        )
      : null;
    return this.toResponse(created, now, targetName);
  }

  async listDiscounts(input: ListDiscountsInput) {
    const now = new Date();
    const { page, limit } = input;
    const { rows, total } = await this.repo.list({
      search: input.search,
      status: input.status,
      page,
      limit,
      now,
    });
    const totalPages = Math.ceil(total / limit);

    return {
      data: rows.map((row) => this.toListItemResponse(row, now)),
      meta: { page, limit, total, totalPages },
    };
  }

  async getDiscountDetail(id: string) {
    const now = new Date();
    const discount = await this.repo.findById(id);
    if (!discount) {
      throw new NotFoundError("discount not found");
    }

    const targetName = isEntityTarget(discount.appliesToType as AppliesToType)
      ? await this.repo.findTargetName(
          discount.appliesToType as EntityTargetType,
          discount.appliesToId as string,
        )
      : null;

    return this.toResponse(discount, now, targetName);
  }

  async updateDiscount(id: string, input: UpdateDiscountInput) {
    const now = new Date();
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("discount not found");
    }

    const patch: Partial<NewDiscount> = {};

    if (input.code !== undefined) {
      const code = input.code.trim().toUpperCase();
      const duplicate = await this.repo.findByCode(code, id);
      if (duplicate) {
        throw new ConflictError("discount code already exists");
      }
      patch.code = code;
    }

    const merged = {
      discountType: input.discountType ?? existing.discountType,
      discountValue: input.discountValue ?? existing.discountValue,
      startDate: input.startDate
        ? new Date(input.startDate)
        : existing.startDate,
      endDate: input.endDate ? new Date(input.endDate) : existing.endDate,
      appliesToType: (input.appliesToType ??
        existing.appliesToType) as AppliesToType,
      appliesToId:
        input.appliesToId !== undefined
          ? input.appliesToId
          : existing.appliesToId,
    };

    const discountValue = validateDiscountRules(merged);

    if (input.discountType !== undefined)
      patch.discountType = input.discountType;
    if (input.discountValue !== undefined || input.discountType !== undefined) {
      patch.discountValue = discountValue;
    }
    if (input.startDate !== undefined) patch.startDate = merged.startDate;
    if (input.endDate !== undefined) patch.endDate = merged.endDate;
    if (input.usageLimit !== undefined) patch.usageLimit = input.usageLimit;
    if (input.status !== undefined) patch.status = input.status;

    let targetName: string | null = null;
    if (input.appliesToType !== undefined || input.appliesToId !== undefined) {
      const resolvedId = await this.resolveTarget(
        merged.appliesToType,
        merged.appliesToId,
      );
      patch.appliesToType = merged.appliesToType;
      patch.appliesToId = resolvedId;
      targetName = isEntityTarget(merged.appliesToType)
        ? await this.repo.findTargetName(
            merged.appliesToType,
            resolvedId as string,
          )
        : null;
    }

    const updated =
      Object.keys(patch).length > 0
        ? await this.repo.update(id, patch)
        : existing;

    if (
      targetName === null &&
      isEntityTarget(updated.appliesToType as AppliesToType)
    ) {
      targetName = await this.repo.findTargetName(
        updated.appliesToType as EntityTargetType,
        updated.appliesToId as string,
      );
    }

    logger.info({ discountId: id }, "discount updated");
    return this.toResponse(updated, now, targetName);
  }

  async deleteDiscount(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("discount not found");
    }

    await this.repo.softDelete(id);
    logger.info({ discountId: id }, "discount deleted");
  }

  async getDiscountStats() {
    const now = new Date();
    return this.repo.stats(now);
  }
}
