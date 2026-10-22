import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  numeric,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
} from "drizzle-orm/pg-core";

// IDs are generated from a sequence and zero-padded by padded_id() (see migration 0001),
// e.g. C01, P001, W01.
const generatedId = (prefix: string, sequence: string, width: number) =>
  text("id")
    .primaryKey()
    .default(sql.raw(`padded_id('${prefix}', nextval('${sequence}'), ${width})`));

export const categoriesIdSeq = pgSequence("categories_id_seq");
export const productsIdSeq = pgSequence("products_id_seq");
export const warehousesIdSeq = pgSequence("warehouses_id_seq");

export const categories = pgTable("categories", {
  id: generatedId("C", "categories_id_seq", 2),
  name: text("name").notNull().unique(),
});

export const products = pgTable("products", {
  id: generatedId("P", "products_id_seq", 3),
  name: text("name").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  requiresColdChain: boolean("requires_cold_chain").notNull().default(false),
});

export const warehouses = pgTable(
  "warehouses",
  {
    id: generatedId("W", "warehouses_id_seq", 2),
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

// Past deliveries from each warehouse to the customer. The departure has a day of the week
// and a time, but no date.
export const deliveries = pgTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    departureDay: text("departure_day").notNull(),
    departureTime: time("departure_time").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    notes: text("notes"),
  },
  (t) => [
    check(
      "departure_day_valid",
      sql`${t.departureDay} IN ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')`,
    ),
    check("duration_positive", sql`${t.durationMinutes} > 0`),
  ],
);
