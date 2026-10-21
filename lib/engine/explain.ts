import { stockOf } from "./eligibility";
import type { Selection } from "./select";
import type { Exclusion, OrderLine, Shipment, Shortfall, Snapshot, Status, Transfer, Warehouse } from "./types";

type ExplainInput = {
  lines: OrderLine[];
  warehouses: Warehouse[]; // nearest first
  selection: Selection;
  shipments: Shipment[];
  transfers: Transfer[];
  unfulfilled: Shortfall[];
  excluded: Exclusion[];
  status: Status;
};

const joinList = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

const place = (warehouse: Warehouse) => `${warehouse.id} (${warehouse.distanceToCustomerKm} km)`;

function missingCapability(warehouse: Warehouse) {
  const missing = [];
  if (!warehouse.hasColdStorage) missing.push("no cold storage");
  if (!warehouse.hasRefrigeratedFleet) missing.push("no refrigerated fleet");
  return joinList(missing);
}

// Builds the explanation from fixed templates in this order: outcome, cold-chain
// exclusions, transit, allocation per product, shortfall per product.
export function explain(input: ExplainInput, snapshot: Snapshot): string[] {
  const { lines, warehouses, selection, shipments, transfers, unfulfilled, excluded, status } = input;
  const name = (productId: string) => snapshot.products.get(productId)!.name;
  const coldChainExcluded = excluded.filter((e) => e.reason === "NO_COLD_CHAIN");
  const explanation: string[] = [];

  // Outcome
  if (status === "UNFULFILLABLE") {
    explanation.push("No eligible warehouse has stock of the ordered products, so nothing can be shipped.");
  } else if (selection.mode === "SINGLE" && transfers.length > 0) {
    const hub = selection.allocations[0].hub;
    explanation.push(
      `Fulfilled with 1 delivery from ${place(hub)}. Warehouses in ${hub.city} together supply the whole order.`,
    );
  } else if (selection.mode === "SINGLE") {
    const warehouse = shipments[0];
    explanation.push(
      `Fulfilled from 1 warehouse (${warehouse.warehouseId}, ${warehouse.distanceKm} km), the nearest warehouse that can supply the whole order.`,
    );
  } else if (shipments.length === 1) {
    const warehouse = shipments[0];
    explanation.push(
      `Shipped from 1 warehouse (${warehouse.warehouseId}, ${warehouse.distanceKm} km). No warehouse can supply the whole order.`,
    );
  } else {
    explanation.push(
      `Split across ${shipments.length} warehouses because no single warehouse can supply the whole order. Each product is taken from the nearest eligible warehouse first.`,
    );
  }

  // Cold-chain exclusions, one line per warehouse
  for (const warehouse of warehouses) {
    const products = coldChainExcluded
      .filter((e) => e.warehouseId === warehouse.id)
      .map((e) => name(e.productId));
    if (products.length === 0) continue;
    explanation.push(
      `${place(warehouse)} holds ${joinList(products)} but has ${missingCapability(warehouse)}, so it cannot deliver cold-chain products.`,
    );
  }

  // Transit, one line per transfer
  for (const { fromWarehouseId, toWarehouseId, productId, quantity } of transfers) {
    explanation.push(
      `${fromWarehouseId} sends ${quantity} ${name(productId)} to ${toWarehouseId} for transit. ${toWarehouseId} delivers them to the customer.`,
    );
  }

  // Allocation, one line per product
  for (const { productId } of lines) {
    const parts = selection.allocations
      .filter((a) => a.productId === productId)
      .map((a) =>
        a.warehouse === a.hub
          ? `${a.quantity} from ${place(a.warehouse)}`
          : `${a.quantity} from ${a.warehouse.id} through ${place(a.hub)}`,
      );
    if (parts.length === 0) continue;
    explanation.push(`${name(productId)}: ${joinList(parts)}.`);
  }

  // Shortfall, one line per product
  for (const { productId, requested, available } of unfulfilled) {
    let line = `${name(productId)}: ${available} of ${requested} can be shipped, ${requested - available} short.`;
    const blocked = coldChainExcluded.filter((e) => e.productId === productId);
    if (blocked.length > 0) {
      const held = blocked.reduce((sum, e) => sum + stockOf(snapshot, e.warehouseId, productId), 0);
      const verb = blocked.length === 1 ? "holds" : "hold";
      line += ` ${joinList(blocked.map((e) => e.warehouseId))} ${verb} ${held} more but cannot deliver cold-chain products.`;
    }
    explanation.push(line);
  }

  return explanation;
}
