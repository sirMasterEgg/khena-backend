import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { auditColumns } from "./audit-columns";
import { products } from "./product.model";

export const careInstructions = pgTable("care_instructions", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  instruction: text("instruction").notNull(),
  ...auditColumns,
});

export const productCareInstructions = pgTable("product_care_instructions", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  careInstructionId: uuid("care_instruction_id")
    .notNull()
    .references(() => careInstructions.id),
  ...auditColumns,
});

export type CareInstruction = typeof careInstructions.$inferSelect;
export type NewCareInstruction = typeof careInstructions.$inferInsert;

export type ProductCareInstruction =
  typeof productCareInstructions.$inferSelect;
export type NewProductCareInstruction =
  typeof productCareInstructions.$inferInsert;
