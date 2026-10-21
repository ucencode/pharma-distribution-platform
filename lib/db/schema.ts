import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  requiresColdChain: boolean("requires_cold_chain").notNull().default(false),
});

export const warehouses = pgTable(
  "warehouses",
  {
    id: text("id").primaryKey(),
    city: text("city").notNull(),
    distanceToCustomerKm: numeric("distance_to_customer_km", {
      precision: 7,
      scale: 2,
      mode: "number",
    }).notNull(),
    hasColdStorage: boolean("has_cold_storage").notNull().default(false),
    hasRefrigeratedFleet: boolean("has_refrigerated_fleet").notNull().default(false),
  },
  (t) => [check("distance_non_negative", sql`${t.distanceToCustomerKm} >= 0`)],
);

export const inventory = pgTable(
  "inventory",
  {
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.warehouseId, t.productId] }),
    check("quantity_non_negative", sql`${t.quantity} >= 0`),
  ],
);
