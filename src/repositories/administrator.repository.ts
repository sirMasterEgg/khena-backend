import { and, desc, eq, ilike, isNull, or, type SQL, sql } from "drizzle-orm";
import {
  type Administrator,
  administrators,
  type NewAdministrator,
} from "../models/administrator.model";
import { administratorSessions } from "../models/administrator-session.model";
import { type Role, roles } from "../models/role.model";
import { stampCreate, stampDelete, stampUpdate } from "../utils/audit";
import { db } from "../utils/db";

interface AdministratorWithRole {
  id: string;
  name: string;
  email: string;
  role: { id: string; name: string } | null;
}

interface ListAdministratorsFilter {
  search?: string;
  roleId?: string;
  page: number;
  limit: number;
}

export class AdministratorRepository {
  async findById(id: string): Promise<Administrator | undefined> {
    const result = await db
      .select()
      .from(administrators)
      .where(and(eq(administrators.id, id), isNull(administrators.deletedAt)))
      .limit(1);
    return result[0];
  }

  async findByEmail(email: string): Promise<Administrator | undefined> {
    const result = await db
      .select()
      .from(administrators)
      .where(
        and(eq(administrators.email, email), isNull(administrators.deletedAt)),
      )
      .limit(1);
    return result[0];
  }

  async findDetailById(id: string): Promise<AdministratorWithRole | undefined> {
    const result = await db
      .select({
        id: administrators.id,
        name: administrators.name,
        email: administrators.email,
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(administrators)
      .leftJoin(roles, eq(administrators.roleId, roles.id))
      .where(and(eq(administrators.id, id), isNull(administrators.deletedAt)))
      .limit(1);
    const row = result[0];
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role:
        row.roleId && row.roleName
          ? { id: row.roleId, name: row.roleName }
          : null,
    };
  }

  async list(
    filter: ListAdministratorsFilter,
  ): Promise<{ rows: AdministratorWithRole[]; total: number }> {
    const conditions: SQL[] = [isNull(administrators.deletedAt)];
    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(administrators.name, pattern),
          ilike(administrators.email, pattern),
        ) as SQL,
      );
    }
    if (filter.roleId) {
      conditions.push(eq(administrators.roleId, filter.roleId));
    }
    const where = and(...conditions);

    const rows = await db
      .select({
        id: administrators.id,
        name: administrators.name,
        email: administrators.email,
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(administrators)
      .leftJoin(roles, eq(administrators.roleId, roles.id))
      .where(where)
      .orderBy(desc(administrators.createdAt))
      .limit(filter.limit)
      .offset((filter.page - 1) * filter.limit);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(administrators)
      .where(where);
    const total = Number(countResult[0]?.count ?? 0);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role:
          row.roleId && row.roleName
            ? { id: row.roleId, name: row.roleName }
            : null,
      })),
      total,
    };
  }

  async create(data: NewAdministrator): Promise<Administrator> {
    const result = await db
      .insert(administrators)
      .values(stampCreate(data))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to create administrator");
    }
    return row;
  }

  async update(
    id: string,
    data: Partial<NewAdministrator>,
  ): Promise<Administrator> {
    const result = await db
      .update(administrators)
      .set(stampUpdate(data))
      .where(eq(administrators.id, id))
      .returning();
    const row = result[0];
    if (!row) {
      throw new Error("failed to update administrator");
    }
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await db
      .update(administrators)
      .set(stampDelete())
      .where(eq(administrators.id, id));
  }

  async revokeSessionsByAdministratorId(id: string): Promise<void> {
    await db
      .update(administratorSessions)
      .set(stampUpdate({ revoked: true }))
      .where(
        and(
          eq(administratorSessions.administratorId, id),
          eq(administratorSessions.revoked, false),
        ),
      );
  }

  async findActiveRoleById(roleId: string): Promise<Role | undefined> {
    const result = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)))
      .limit(1);
    return result[0];
  }
}
