import { stringify } from "csv-stringify/sync";
import type { Customer, NewCustomer } from "../models/customer.model";
import type {
  CustomerRepository,
  CustomerSegmentFilter,
  CustomerSort,
} from "../repositories/customer.repository";
import type { Tx } from "../utils/db";
import { ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

const allowedSorts: CustomerSort[] = [
  "ltv",
  "totalOrder",
  "lastOrderAt",
  "joinedAt",
  "name",
];

interface CreateCustomerInput {
  name: string;
  email: string;
  phone: string;
}

interface UpdateCustomerInput {
  name?: string;
  email?: string;
  phone?: string;
  internalNotes?: string | null;
}

interface ListCustomersInput {
  search?: string;
  segment?: string;
  sort?: string;
  orderDir?: string;
  page: number;
  limit: number;
}

const CSV_COLUMNS = [
  "name",
  "email",
  "phone",
  "total_order",
  "lifetime_value",
  "average_order",
  "customer_segment",
  "joined_at",
] as const;

function averageOrder(totalOrder: number, lifetimeValue: number): number {
  return totalOrder === 0 ? 0 : Math.round(lifetimeValue / totalOrder);
}

export class CustomerService {
  constructor(private readonly repo: CustomerRepository) {}

  private async assertNoDuplicate(
    email: string,
    phone: string,
    excludeId?: string,
  ) {
    const [emailOwner, phoneOwner] = await Promise.all([
      this.repo.findByEmail(email, excludeId),
      this.repo.findByPhone(phone, excludeId),
    ]);
    if (emailOwner) {
      throw new ConflictError("email already exists");
    }
    if (phoneOwner) {
      throw new ConflictError("phone already exists");
    }
  }

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    await this.assertNoDuplicate(input.email, input.phone);

    const created = await this.repo.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      joinedAt: new Date(),
    });

    logger.info({ customerId: created.id }, "customer created");
    return created;
  }

  async listCustomers(input: ListCustomersInput) {
    const sort = allowedSorts.includes(input.sort as CustomerSort)
      ? (input.sort as CustomerSort)
      : "joinedAt";
    const orderDir = input.orderDir === "asc" ? "asc" : "desc";
    const segment: CustomerSegmentFilter =
      input.segment === "vip" ||
      input.segment === "loyal" ||
      input.segment === "new"
        ? input.segment
        : "all";
    const { page, limit } = input;

    const { rows, total } = await this.repo.list({
      search: input.search,
      segment,
      sort,
      orderDir,
      page,
      limit,
    });
    const totalPages = Math.ceil(total / limit);

    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        totalOrder: row.totalOrder,
        lifetimeValue: row.lifetimeValue,
        lastOrderAt: row.lastOrderAt,
        joinedAt: row.joinedAt,
        segment: row.segment,
      })),
      meta: { page, limit, total, totalPages },
    };
  }

  async getCustomerDetail(id: string) {
    const customer = await this.repo.findByIdWithSegment(id);
    if (!customer) {
      throw new NotFoundError("customer not found");
    }

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      joinedAt: customer.joinedAt,
      internalNotes: customer.internalNotes,
      totalOrders: customer.totalOrder,
      lifetimeValue: customer.lifetimeValue,
      averageOrder: averageOrder(customer.totalOrder, customer.lifetimeValue),
      segment: customer.segment,
    };
  }

  async updateCustomer(
    id: string,
    input: UpdateCustomerInput,
  ): Promise<Customer> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("customer not found");
    }

    if (input.email !== undefined) {
      const owner = await this.repo.findByEmail(input.email, id);
      if (owner) {
        throw new ConflictError("email already exists");
      }
    }
    if (input.phone !== undefined) {
      const owner = await this.repo.findByPhone(input.phone, id);
      if (owner) {
        throw new ConflictError("phone already exists");
      }
    }

    const patch: Partial<NewCustomer> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.internalNotes !== undefined) {
      patch.internalNotes = input.internalNotes;
    }

    const updated =
      Object.keys(patch).length > 0
        ? await this.repo.update(id, patch)
        : existing;

    logger.info({ customerId: id }, "customer updated");
    return updated;
  }

  async getCustomerStats() {
    return await this.repo.stats();
  }

  /**
   * Export seluruh customer aktif jadi CSV di memori (GET /customers/bulk).
   * Satu query dengan JOIN segment, tanpa pagination — lihat kontrak Tahap 5.6.
   */
  async exportCustomersCsv(): Promise<string> {
    const rows = await this.repo.findAllActiveWithSegment();

    const csvRows = rows.map((row) => ({
      name: row.name,
      email: row.email,
      phone: row.phone,
      total_order: row.totalOrder,
      lifetime_value: row.lifetimeValue,
      average_order: averageOrder(row.totalOrder, row.lifetimeValue),
      customer_segment: row.segment,
      joined_at: row.joinedAt.toISOString(),
    }));

    return stringify(csvRows, {
      header: true,
      columns: CSV_COLUMNS as unknown as string[],
    });
  }

  /**
   * Panggil TEPAT SEKALI saat sebuah sales order bertransisi ke status
   * "completed". orderTotal = sales_orders.total (grand total setelah
   * diskon + ongkir). Method publik untuk dipanggil module order (belum ada
   * di codebase ini).
   */
  async recordCompletedOrder(
    customerId: string,
    orderTotal: number,
    orderDate: Date,
    tx?: Tx,
  ): Promise<void> {
    await this.repo.recordCompletedOrder(customerId, orderTotal, orderDate, tx);
  }
}
