import type { NewRole, Role } from "../models/role.model";
import type { RoleRepository } from "../repositories/role.repository";
import { db } from "../utils/db";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  permissions?: string[];
}

interface ListRolesInput {
  search?: string;
  page: number;
  limit: number;
}

export class RoleService {
  constructor(private readonly repo: RoleRepository) {}

  // Validasi + terjemahkan code -> permissionId. Dipakai create & update.
  private async resolvePermissionIds(codes: string[]): Promise<string[]> {
    if (codes.length === 0) return [];
    const unique = [...new Set(codes)];
    const found = await this.repo.findPermissionsByCodes(unique);
    const foundCodes = new Set(found.map((p) => p.code));
    const unknown = unique.filter((c) => !foundCodes.has(c));
    if (unknown.length > 0) {
      throw new BadRequestError(
        `unknown permission code: ${unknown.join(", ")}`,
      );
    }
    return found.map((p) => p.id);
  }

  private toRoleResponse(role: Role, codes: string[]) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: codes,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      deletedAt: role.deletedAt,
      createdBy: role.createdBy,
      updatedBy: role.updatedBy,
      deletedBy: role.deletedBy,
    };
  }

  async createRole(input: CreateRoleInput) {
    const existing = await this.repo.findByName(input.name);
    if (existing) {
      throw new ConflictError("role name already exists");
    }
    const permissionIds = await this.resolvePermissionIds(input.permissions);

    const role = await db.transaction(async (tx) => {
      const created = await this.repo.create(
        { name: input.name, description: input.description },
        tx,
      );
      await this.repo.insertRolePermissions(
        permissionIds.map((permissionId) => ({
          roleId: created.id,
          permissionId,
        })),
        tx,
      );
      return created;
    });

    logger.info({ roleId: role.id }, "role created");
    return this.toRoleResponse(role, [...new Set(input.permissions)]);
  }

  async listRoles(input: ListRolesInput) {
    const { page, limit } = input;
    const { rows, total } = await this.repo.list({
      search: input.search,
      page,
      limit,
    });
    const totalPages = Math.ceil(total / limit);

    const ids = rows.map((r) => r.id);
    const permissionRows = await this.repo.findPermissionCodesByRoleIds(ids);
    const codesByRoleId = new Map<string, string[]>();
    for (const row of permissionRows) {
      const list = codesByRoleId.get(row.roleId) ?? [];
      list.push(row.code);
      codesByRoleId.set(row.roleId, list);
    }

    return {
      data: rows.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: codesByRoleId.get(role.id) ?? [],
      })),
      meta: { page, limit, total, totalPages },
    };
  }

  async getRoleDetail(id: string) {
    const role = await this.repo.findById(id);
    if (!role) {
      throw new NotFoundError("role not found");
    }
    const permissionRows = await this.repo.findPermissionCodesByRoleIds([id]);
    return this.toRoleResponse(
      role,
      permissionRows.map((r) => r.code),
    );
  }

  async updateRole(id: string, input: UpdateRoleInput) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("role not found");
    }
    if (input.name !== undefined && input.name !== existing.name) {
      const nameOwner = await this.repo.findByName(input.name);
      if (nameOwner) {
        throw new ConflictError("role name already exists");
      }
    }
    const permissionIds =
      input.permissions !== undefined
        ? await this.resolvePermissionIds(input.permissions)
        : undefined;

    const role = await db.transaction(async (tx) => {
      const patch: Partial<NewRole> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined)
        patch.description = input.description;

      const updated =
        Object.keys(patch).length > 0
          ? await this.repo.update(id, patch, tx)
          : existing;

      if (permissionIds !== undefined) {
        await this.repo.deleteRolePermissionsByRoleId(id, tx);
        await this.repo.insertRolePermissions(
          permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          tx,
        );
      }

      return updated;
    });

    const codes =
      input.permissions !== undefined
        ? [...new Set(input.permissions)]
        : (await this.repo.findPermissionCodesByRoleIds([id])).map(
            (r) => r.code,
          );

    logger.info({ roleId: id }, "role updated");
    return this.toRoleResponse(role, codes);
  }

  async deleteRole(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("role not found");
    }
    const activeAdmins = await this.repo.countActiveAdministratorsByRoleId(id);
    if (activeAdmins > 0) {
      throw new ConflictError("role still assigned to administrators");
    }

    await db.transaction(async (tx) => {
      await this.repo.deleteRolePermissionsByRoleId(id, tx);
      await this.repo.softDelete(id, tx);
    });
    logger.info({ roleId: id }, "role deleted");
  }
}
