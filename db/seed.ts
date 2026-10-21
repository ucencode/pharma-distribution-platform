import { sql } from "drizzle-orm";
import { closeDb, db } from "../lib/db/client";
import { categories, inventory, products, warehouses } from "../lib/db/schema";

const categoryRows: (typeof categories.$inferInsert)[] = [
  { id: "C01", name: "Medical Supplies" },
  { id: "C02", name: "Pharmaceutical" },
];

const productRows: (typeof products.$inferInsert)[] = [
  { id: "P001", name: "Surgical Gloves (Box of 100)", categoryId: "C01", requiresColdChain: false },
  { id: "P002", name: "Vaccine — Hepatitis B (10-dose vial)", categoryId: "C02", requiresColdChain: true },
  { id: "P003", name: "Disposable Syringe (Box of 50)", categoryId: "C01", requiresColdChain: false },
  { id: "P004", name: "Vaccine — Tetanus Toxoid (10-dose vial)", categoryId: "C02", requiresColdChain: true },
  { id: "P005", name: "Paracetamol Tablets (Box of 100)", categoryId: "C02", requiresColdChain: false },
];

const warehouseRows: (typeof warehouses.$inferInsert)[] = [
  { id: "W01", city: "Surabaya", distanceToCustomerKm: 5, hasColdStorage: false, hasRefrigeratedFleet: false },
  { id: "W02", city: "Surabaya", distanceToCustomerKm: 12, hasColdStorage: true, hasRefrigeratedFleet: false },
  { id: "W03", city: "Sidoarjo", distanceToCustomerKm: 25, hasColdStorage: false, hasRefrigeratedFleet: false },
  { id: "W04", city: "Gresik", distanceToCustomerKm: 30, hasColdStorage: true, hasRefrigeratedFleet: true },
  { id: "W05", city: "Malang", distanceToCustomerKm: 90, hasColdStorage: false, hasRefrigeratedFleet: false },
  { id: "W06", city: "Malang", distanceToCustomerKm: 95, hasColdStorage: true, hasRefrigeratedFleet: false },
  { id: "W07", city: "Pasuruan", distanceToCustomerKm: 45, hasColdStorage: true, hasRefrigeratedFleet: true },
  { id: "W08", city: "Jember", distanceToCustomerKm: 150, hasColdStorage: true, hasRefrigeratedFleet: true },
];

const stock: Record<string, Record<string, number>> = {
  W01: { P001: 200, P003: 500, P005: 300 },
  W02: { P001: 50, P002: 30, P004: 20 },
  W03: { P001: 300, P003: 200 },
  W04: { P002: 40, P004: 25, P005: 100 },
  W05: { P001: 400, P003: 300, P005: 500 },
  W06: { P002: 20, P004: 30, P003: 100 },
  W07: { P002: 8, P004: 10, P001: 150 },
  W08: { P002: 60, P004: 50, P005: 200 },
};

const inventoryRows = Object.entries(stock).flatMap(([warehouseId, items]) =>
  Object.entries(items).map(([productId, quantity]) => ({ warehouseId, productId, quantity })),
);

async function main() {
  await db
    .insert(categories)
    .values(categoryRows)
    .onConflictDoUpdate({ target: categories.id, set: { name: sql`excluded.name` } });

  await db
    .insert(products)
    .values(productRows)
    .onConflictDoUpdate({
      target: products.id,
      set: {
        name: sql`excluded.name`,
        categoryId: sql`excluded.category_id`,
        requiresColdChain: sql`excluded.requires_cold_chain`,
      },
    });

  await db
    .insert(warehouses)
    .values(warehouseRows)
    .onConflictDoUpdate({
      target: warehouses.id,
      set: {
        city: sql`excluded.city`,
        distanceToCustomerKm: sql`excluded.distance_to_customer_km`,
        hasColdStorage: sql`excluded.has_cold_storage`,
        hasRefrigeratedFleet: sql`excluded.has_refrigerated_fleet`,
      },
    });

  await db
    .insert(inventory)
    .values(inventoryRows)
    .onConflictDoUpdate({
      target: [inventory.warehouseId, inventory.productId],
      set: { quantity: sql`excluded.quantity`, updatedAt: sql`now()` },
    });

  console.log(
    `Seeded ${categoryRows.length} categories, ${productRows.length} products, ${warehouseRows.length} warehouses, ${inventoryRows.length} stock rows.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
