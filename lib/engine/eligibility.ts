import type { Exclusion, OrderLine, Product, Snapshot, Warehouse } from "./types";

// A cold-chain product needs refrigerated storage and refrigerated delivery.
export function canShip(product: Product, warehouse: Warehouse): boolean {
  if (!product.requiresColdChain) return true;
  return warehouse.hasColdStorage && warehouse.hasRefrigeratedFleet;
}

export function stockOf(snapshot: Snapshot, warehouseId: string, productId: string): number {
  return snapshot.stock.get(warehouseId)?.get(productId) ?? 0;
}

// Nearest first; equal distances are ordered by ID.
export function byDistance(warehouses: Warehouse[]): Warehouse[] {
  return [...warehouses].sort(
    (a, b) => a.distanceToCustomerKm - b.distanceToCustomerKm || a.id.localeCompare(b.id),
  );
}

// For each ordered product, the warehouses that can supply it (nearest first) and the
// warehouses that cannot, with the reason. A warehouse without stock is NO_STOCK even
// when it also lacks cold-chain capability.
export function eligibility(lines: OrderLine[], warehouses: Warehouse[], snapshot: Snapshot) {
  const eligible = new Map<string, Warehouse[]>();
  const excluded: Exclusion[] = [];

  for (const { productId } of lines) {
    const product = snapshot.products.get(productId)!;
    const list: Warehouse[] = [];
    for (const warehouse of warehouses) {
      if (stockOf(snapshot, warehouse.id, productId) === 0) {
        excluded.push({ warehouseId: warehouse.id, productId, reason: "NO_STOCK" });
      } else if (!canShip(product, warehouse)) {
        excluded.push({ warehouseId: warehouse.id, productId, reason: "NO_COLD_CHAIN" });
      } else {
        list.push(warehouse);
      }
    }
    eligible.set(productId, list);
  }

  return { eligible, excluded };
}
