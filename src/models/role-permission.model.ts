import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { permissions } from "./permission.model";
import { roles } from "./role.model";

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id),
    ...auditColumns,
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
