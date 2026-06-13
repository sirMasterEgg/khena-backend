import { timestamp, varchar } from "drizzle-orm/pg-core";

export const auditColumns = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  createdBy: varchar("created_by", { length: 255 }),
  updatedBy: varchar("updated_by", { length: 255 }),
  deletedBy: varchar("deleted_by", { length: 255 }),
};
