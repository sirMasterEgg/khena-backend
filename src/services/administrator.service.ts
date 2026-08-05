import type {
  Administrator,
  NewAdministrator,
} from "../models/administrator.model";
import type { AdministratorRepository } from "../repositories/administrator.repository";
import { ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

interface CreateAdministratorInput {
  name: string;
  email: string;
  password: string;
  roleId: string;
}

interface UpdateAdministratorInput {
  name?: string;
  email?: string;
  password?: string;
  roleId?: string;
}

interface ListAdministratorsInput {
  search?: string;
  roleId?: string;
  page: number;
  limit: number;
}

/** Buang field password sebelum keluar dari service. */
function toAdministratorResponse(row: Administrator) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    roleId: row.roleId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedBy: row.deletedBy,
  };
}

export class AdministratorService {
  constructor(private readonly repo: AdministratorRepository) {}

  async createAdministrator(input: CreateAdministratorInput) {
    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError("email already exists");
    }

    const role = await this.repo.findActiveRoleById(input.roleId);
    if (!role) {
      throw new NotFoundError("role not found");
    }

    const created = await this.repo.create({
      name: input.name,
      email: input.email,
      password: await Bun.password.hash(input.password),
      roleId: input.roleId,
    });

    logger.info({ administratorId: created.id }, "administrator created");
    return toAdministratorResponse(created);
  }

  async listAdministrators(input: ListAdministratorsInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list({
      search: input.search,
      roleId: input.roleId,
      page,
      limit,
    });
    const totalPages = Math.ceil(total / limit);

    return {
      data: rows,
      meta: { page, limit, total, totalPages },
    };
  }

  async getAdministratorDetail(id: string) {
    const administrator = await this.repo.findDetailById(id);
    if (!administrator) {
      throw new NotFoundError("administrator not found");
    }
    return administrator;
  }

  async updateAdministrator(id: string, input: UpdateAdministratorInput) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("administrator not found");
    }

    if (input.email !== undefined && input.email !== existing.email) {
      const emailOwner = await this.repo.findByEmail(input.email);
      if (emailOwner) {
        throw new ConflictError("email already exists");
      }
    }

    if (input.roleId !== undefined) {
      const role = await this.repo.findActiveRoleById(input.roleId);
      if (!role) {
        throw new NotFoundError("role not found");
      }
    }

    const patch: Partial<NewAdministrator> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.email !== undefined) patch.email = input.email;
    if (input.roleId !== undefined) patch.roleId = input.roleId;

    let passwordChanged = false;
    if (input.password !== undefined) {
      patch.password = await Bun.password.hash(input.password);
      passwordChanged = true;
    }

    const updated =
      Object.keys(patch).length > 0
        ? await this.repo.update(id, patch)
        : existing;

    if (passwordChanged) {
      await this.repo.revokeSessionsByAdministratorId(id);
    }

    logger.info({ administratorId: id }, "administrator updated");
    return toAdministratorResponse(updated);
  }

  async deleteAdministrator(id: string, currentAdministratorId: string) {
    if (id === currentAdministratorId) {
      throw new ConflictError("cannot delete your own account");
    }

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("administrator not found");
    }

    await this.repo.softDelete(id);
    await this.repo.revokeSessionsByAdministratorId(id);
    logger.info({ administratorId: id }, "administrator deleted");
  }
}
