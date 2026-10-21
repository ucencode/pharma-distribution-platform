import type { Snapshot } from "@/lib/engine";
import { db } from "./client";
import { inventory, products, warehouses } from "./schema";

// Loads the products, warehouses and stock the engine needs, with one query per table.
export async function loadSnapshot(): Promise<Snapshot> {
  const [productRows, warehouseRows, stockRows] = await Promise.all([
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
  };
}
