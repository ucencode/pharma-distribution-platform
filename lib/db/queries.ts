import type { Day, Snapshot } from "@/lib/engine";
import { db } from "./client";
import { deliveries, inventory, products, warehouses } from "./schema";

// Loads the products, warehouses, stock and past deliveries the engine needs, with one
// query per table.
export async function loadSnapshot(): Promise<Snapshot> {
  const [productRows, warehouseRows, stockRows, deliveryRows] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        requiresColdChain: products.requiresColdChain,
      })
      .from(products),
    db.select().from(warehouses),
    db
      .select({
        warehouseId: inventory.warehouseId,
        productId: inventory.productId,
        quantity: inventory.quantity,
      })
      .from(inventory),
    db
      .select({
        warehouseId: deliveries.warehouseId,
        day: deliveries.departureDay,
        time: deliveries.departureTime,
        durationMinutes: deliveries.durationMinutes,
      })
      .from(deliveries),
  ]);

  const stock: Snapshot["stock"] = new Map();
  for (const { warehouseId, productId, quantity } of stockRows) {
    if (!stock.has(warehouseId)) stock.set(warehouseId, new Map());
    stock.get(warehouseId)!.set(productId, quantity);
  }

  return {
    products: new Map(productRows.map((p) => [p.id, p])),
    warehouses: warehouseRows,
    stock,
    // The database returns times as "HH:MM:SS"; the engine compares "HH:MM".
    deliveries: deliveryRows.map((d) => ({ ...d, day: d.day as Day, time: d.time.slice(0, 5) })),
  };
}
