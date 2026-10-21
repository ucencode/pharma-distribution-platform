import { stockOf } from "./eligibility";
import type { OrderLine, Snapshot, Warehouse } from "./types";

export type Allocation = { warehouse: Warehouse; productId: string; quantity: number };

export type Selection = { mode: "SINGLE" | "SPLIT"; allocations: Allocation[] };

// The nearest warehouse that is eligible for every line and holds its full quantity.
function nearestFullWarehouse(
  lines: OrderLine[],
  eligible: Map<string, Warehouse[]>,
  snapshot: Snapshot,
): Warehouse | undefined {
  return eligible
    .get(lines[0].productId)!
    .find((warehouse) =>
      lines.every(
        ({ productId, quantity }) =>
          eligible.get(productId)!.includes(warehouse) &&
          stockOf(snapshot, warehouse.id, productId) >= quantity,
      ),
    );
}

export function select(
  lines: OrderLine[],
  eligible: Map<string, Warehouse[]>,
  snapshot: Snapshot,
): Selection {
  const single = nearestFullWarehouse(lines, eligible, snapshot);
  if (single) {
    return { mode: "SINGLE", allocations: lines.map((line) => ({ warehouse: single, ...line })) };
  }

  // Each product is taken from its nearest eligible warehouse first, then the next nearest.
  const allocations: Allocation[] = [];
  for (const { productId, quantity } of lines) {
    let remaining = quantity;
    for (const warehouse of eligible.get(productId)!) {
      if (remaining === 0) break;
      const taken = Math.min(remaining, stockOf(snapshot, warehouse.id, productId));
      allocations.push({ warehouse, productId, quantity: taken });
      remaining -= taken;
    }
  }
  return { mode: "SPLIT", allocations };
}
