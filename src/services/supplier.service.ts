import type { NewSupplier, Supplier } from "../models/supplier.model";
import type { SupplierRepository } from "../repositories/supplier.repository";
import { ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

interface CreateSupplierInput {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  note?: string;
}

interface UpdateSupplierInput {
  name?: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
}

interface ListSuppliersInput {
  search?: string;
  page: number;
  limit: number;
}

export class SupplierService {
  constructor(private readonly repo: SupplierRepository) {}

  async createSupplier(input: CreateSupplierInput): Promise<Supplier> {
    const created = await this.repo.create({
      name: input.name,
      contactPerson: input.contactPerson,
      phone: input.phone,
      email: input.email,
      note: input.note,
    });

    logger.info({ supplierId: created.id }, "supplier created");
    return created;
  }

  async listSuppliers(input: ListSuppliersInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list({
      search: input.search,
      page,
      limit,
    });
    const totalPages = Math.ceil(total / limit);

    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        contactPerson: row.contactPerson,
        phone: row.phone,
        email: row.email,
      })),
      meta: { page, limit, total, totalPages },
    };
  }

  async getSupplierDetail(id: string) {
    const supplier = await this.repo.findById(id);
    if (!supplier) {
      throw new NotFoundError("supplier not found");
    }

    return {
      id: supplier.id,
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      note: supplier.note,
    };
  }

  async updateSupplier(
    id: string,
    input: UpdateSupplierInput,
  ): Promise<Supplier> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("supplier not found");
    }

    const patch: Partial<NewSupplier> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.contactPerson !== undefined)
      patch.contactPerson = input.contactPerson;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.email !== undefined) patch.email = input.email;
    if (input.note !== undefined) patch.note = input.note;

    const updated =
      Object.keys(patch).length > 0
        ? await this.repo.update(id, patch)
        : existing;

    logger.info({ supplierId: id }, "supplier updated");
    return updated;
  }

  async deleteSupplier(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("supplier not found");
    }

    const activeOrders =
      await this.repo.countActivePurchaseOrdersBySupplier(id);
    if (activeOrders > 0) {
      throw new ConflictError("supplier still has purchase orders");
    }

    await this.repo.softDelete(id);
    logger.info({ supplierId: id }, "supplier deleted");
  }
}
