import { sql } from "drizzle-orm";
import { closeDb, db } from "../lib/db/client";
import { categories, deliveries, inventory, products, warehouses } from "../lib/db/schema";

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

// Past deliveries. Records without a note have `notes` left empty.
const deliveryRows: (typeof deliveries.$inferInsert)[] = [
  { id: "DL001", warehouseId: "W01", departureDay: "Mon", departureTime: "08:00", durationMinutes: 50 },
  { id: "DL002", warehouseId: "W01", departureDay: "Mon", departureTime: "14:00", durationMinutes: 15 },
  { id: "DL003", warehouseId: "W01", departureDay: "Tue", departureTime: "07:30", durationMinutes: 55 },
  { id: "DL004", warehouseId: "W01", departureDay: "Wed", departureTime: "16:30", durationMinutes: 48 },
  { id: "DL005", warehouseId: "W01", departureDay: "Thu", departureTime: "11:00", durationMinutes: 18 },
  { id: "DL006", warehouseId: "W01", departureDay: "Fri", departureTime: "17:00", durationMinutes: 65 },
  { id: "DL007", warehouseId: "W01", departureDay: "Sat", departureTime: "10:00", durationMinutes: 12 },
  { id: "DL008", warehouseId: "W01", departureDay: "Sun", departureTime: "09:00", durationMinutes: 10 },
  { id: "DL009", warehouseId: "W02", departureDay: "Mon", departureTime: "08:00", durationMinutes: 70 },
  { id: "DL010", warehouseId: "W02", departureDay: "Mon", departureTime: "13:00", durationMinutes: 25 },
  { id: "DL011", warehouseId: "W02", departureDay: "Wed", departureTime: "07:45", durationMinutes: 65 },
  { id: "DL012", warehouseId: "W02", departureDay: "Thu", departureTime: "18:00", durationMinutes: 80 },
  { id: "DL013", warehouseId: "W02", departureDay: "Fri", departureTime: "17:30", durationMinutes: 100, notes: "Heavy traffic reported" },
  { id: "DL014", warehouseId: "W02", departureDay: "Sat", departureTime: "11:00", durationMinutes: 22 },
  { id: "DL015", warehouseId: "W02", departureDay: "Sun", departureTime: "10:00", durationMinutes: 20 },
  { id: "DL016", warehouseId: "W03", departureDay: "Mon", departureTime: "09:00", durationMinutes: 45 },
  { id: "DL017", warehouseId: "W03", departureDay: "Tue", departureTime: "15:00", durationMinutes: 40 },
  { id: "DL018", warehouseId: "W03", departureDay: "Thu", departureTime: "07:00", durationMinutes: 60 },
  { id: "DL019", warehouseId: "W03", departureDay: "Fri", departureTime: "16:00", durationMinutes: 75 },
  { id: "DL020", warehouseId: "W03", departureDay: "Sat", departureTime: "13:00", durationMinutes: 35 },
  { id: "DL021", warehouseId: "W04", departureDay: "Mon", departureTime: "10:00", durationMinutes: 50 },
  { id: "DL022", warehouseId: "W04", departureDay: "Wed", departureTime: "08:00", durationMinutes: 70 },
  { id: "DL023", warehouseId: "W04", departureDay: "Thu", departureTime: "14:00", durationMinutes: 45 },
  { id: "DL024", warehouseId: "W04", departureDay: "Fri", departureTime: "17:00", durationMinutes: 85 },
  { id: "DL025", warehouseId: "W04", departureDay: "Sun", departureTime: "11:00", durationMinutes: 38 },
  { id: "DL026", warehouseId: "W05", departureDay: "Tue", departureTime: "09:00", durationMinutes: 130 },
  { id: "DL027", warehouseId: "W05", departureDay: "Thu", departureTime: "10:00", durationMinutes: 125 },
  { id: "DL028", warehouseId: "W05", departureDay: "Fri", departureTime: "14:00", durationMinutes: 165, notes: "Weekend travelers heading to Malang" },
  { id: "DL029", warehouseId: "W05", departureDay: "Sat", departureTime: "08:00", durationMinutes: 170, notes: "Weekend travelers heading to Malang" },
  { id: "DL030", warehouseId: "W05", departureDay: "Sun", departureTime: "16:00", durationMinutes: 190, notes: "Return traffic from Malang" },
  { id: "DL031", warehouseId: "W06", departureDay: "Mon", departureTime: "11:00", durationMinutes: 135 },
  { id: "DL032", warehouseId: "W06", departureDay: "Wed", departureTime: "09:00", durationMinutes: 140 },
  { id: "DL033", warehouseId: "W06", departureDay: "Fri", departureTime: "15:00", durationMinutes: 180, notes: "Weekend travelers heading to Malang" },
  { id: "DL034", warehouseId: "W06", departureDay: "Sun", departureTime: "17:00", durationMinutes: 200, notes: "Return traffic from Malang" },
  { id: "DL035", warehouseId: "W07", departureDay: "Tue", departureTime: "10:00", durationMinutes: 65 },
  { id: "DL036", warehouseId: "W07", departureDay: "Thu", departureTime: "15:00", durationMinutes: 70 },
  { id: "DL037", warehouseId: "W08", departureDay: "Mon", departureTime: "09:00", durationMinutes: 210 },
  { id: "DL038", warehouseId: "W08", departureDay: "Thu", departureTime: "11:00", durationMinutes: 205 },
];

// The seed inserts fixed IDs, so each sequence is moved past the highest one
// to keep generated IDs from colliding with them.
const syncSequence = (table: string, prefix: string) =>
  db.execute(
    sql.raw(
      `SELECT setval('${table}_id_seq', coalesce((SELECT max(substring(id from 2)::bigint) FROM ${table} WHERE id ~ '^${prefix}[0-9]+$'), 0) + 1, false)`,
    ),
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

  await db
    .insert(deliveries)
    .values(deliveryRows)
    .onConflictDoUpdate({
      target: deliveries.id,
      set: {
        warehouseId: sql`excluded.warehouse_id`,
        departureDay: sql`excluded.departure_day`,
        departureTime: sql`excluded.departure_time`,
        durationMinutes: sql`excluded.duration_minutes`,
        notes: sql`excluded.notes`,
      },
    });

  await syncSequence("categories", "C");
  await syncSequence("products", "P");
  await syncSequence("warehouses", "W");

  console.log(
    `Seeded ${categoryRows.length} categories, ${productRows.length} products, ${warehouseRows.length} warehouses, ${inventoryRows.length} stock rows, ${deliveryRows.length} deliveries.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
