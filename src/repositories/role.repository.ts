import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { administrators } from "../models/administrator.model";
import { permissions } from "../models/permission.model";
import { type NewRole, type Role, roles } from "../models/role.model";
import {
  type NewRolePermission,
  rolePermissions,
} from "../models/role-permission.model";
import { stampCreate, stampDelete, stampUpdate } from "../utils/audit";
import { db, type Tx } from "../utils/db";

type DbOrTx = typeof db | Tx;

interface ListRolesFilter {
  search?: string;
  page: number;
  limit: number;
}

export class RoleRepository {
  async findById(id: string): Promise<Role | undefined> {
    const result = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, id), isNull(roles.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findByName(name: string): Promise<Role | undefined> {
    const result = await db
      .select()
      .from(roles)
      .where(and(eq(roles.name, name), isNull(roles.deletedAt)))
      .limit(1);
    return result[0];
  }

  async list(
    filter: ListRolesFilter,
  ): Promise<{ rows: Role[]; total: number }> {
    const conditions: SQL[] = [isNull(roles.deletedAt)];
    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(roles.name, pattern),
          ilike(roles.description, pattern),
        ) as SQL,
      );
    }
    const where = and(...conditions);

    const rows = await db
      .select()
      .from(roles)
      .where(where)
      .orderBy(desc(roles.createdAt))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(roles)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return { rows, total };
  }

  /** Satu query untuk seluruh role id, hindari N+1. */
  async findPermissionCodesByRoleIds(
    roleIds: string[],
  ): Promise<{ roleId: string; code: string }[]> {
    if (roleIds.length === 0) {
      return [];
    }
    return await db
      .select({ roleId: rolePermissions.roleId, code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, roleIds));
  }

  async findPermissionsByCodes(
    codes: string[],
  ): Promise<{ id: string; code: string }[]> {
    if (codes.length === 0) {
      return [];
    }
    return await db
      .select({ id: permissions.id, code: permissions.code })
      .from(permissions)
      .where(
        and(inArray(permissions.code, codes), isNull(permissions.deletedAt)),
      );
  }

  async create(data: NewRole, tx: DbOrTx): Promise<Role> {
    const result = await tx.insert(roles).values(stampCreate(data)).returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create role");
    }
    return row;
  }

  async update(id: string, data: Partial<NewRole>, tx: DbOrTx): Promise<Role> {
    const result = await tx
      .update(roles)
      .set(stampUpdate(data))
      .where(eq(roles.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update role");
    }
    return row;
  }

  async softDelete(id: string, tx: DbOrTx): Promise<void> {
    await tx.update(roles).set(stampDelete()).where(eq(roles.id, id));
  }

  async insertRolePermissions(
    rows: NewRolePermission[],
    tx: DbOrTx,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await tx.insert(rolePermissions).values(rows.map(stampCreate));
  }

  /** Hard delete: lihat catatan §5.2 di issue — PK komposit + auth lookup tidak filter deletedAt. */
  async deleteRolePermissionsByRoleId(
    roleId: string,
    tx: DbOrTx,
  ): Promise<void> {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  }

  async countActiveAdministratorsByRoleId(roleId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(administrators)
      .where(
        and(
          eq(administrators.roleId, roleId),
          isNull(administrators.deletedAt),
        ),
      );
    return Number(result[0]?.count ?? 0);
  }
}
