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

// A line names the city at the first mention of each warehouse, for example "W01 (Surabaya)".
const label = (warehouse: Warehouse) => `${warehouse.id} (${warehouse.city})`;

const place = (warehouse: Warehouse) =>
  `${warehouse.id} (${warehouse.city}, ${warehouse.distanceToCustomerKm} km)`;

const km = (shipment: Shipment) => `${shipment.approximate ? "about " : ""}${shipment.distanceKm} km`;

function missingCapability(warehouse: Warehouse) {
  const missing = [];
  if (!warehouse.hasColdStorage) missing.push("no cold storage");
  if (!warehouse.hasRefrigeratedFleet) missing.push("no refrigerated fleet");
  return joinList(missing);
}

// Builds the explanation from fixed templates in this order: outcome, cold-chain
// exclusions, van pickups, transit, allocation per product, shortfall per product.
export function explain(input: ExplainInput, snapshot: Snapshot): string[] {
  const { lines, warehouses, selection, shipments, transfers, unfulfilled, excluded, status } = input;
  const name = (productId: string) => snapshot.products.get(productId)!.name;
  const warehouse = (id: string) => warehouses.find((w) => w.id === id)!;
  const shippedFrom = (shipment: Shipment) => {
    const { id, city } = warehouse(shipment.warehouseId);
    return `${id} (${city}, ${km(shipment)})`;
  };
  const pickedUp = (warehouseId: string, productId: string) =>
    selection.allocations
      .filter((a) => a.van && a.warehouse.id === warehouseId && a.productId === productId)
      .reduce((sum, a) => sum + a.quantity, 0);
  const pickups = shipments.filter((s) => s.vanFromWarehouseId);
  const coldChainExcluded = excluded.filter((e) => e.reason === "NO_COLD_CHAIN");
  const explanation: string[] = [];

  // Outcome
  if (status === "UNFULFILLABLE") {
    explanation.push("Nothing can be shipped: no warehouse that can deliver these products has them in stock.");
  } else if (selection.mode === "SINGLE" && transfers.length > 0) {
    const hub = selection.allocations[0].hub;
    explanation.push(
      `Shipped in one delivery from ${place(hub)}. The ${hub.city} warehouses together have the whole order, so they combine their stock at ${hub.id}.`,
    );
  } else if (selection.mode === "SINGLE") {
    explanation.push(
      `Shipped in full from ${shippedFrom(shipments[0])}, the nearest warehouse with the whole order in stock.`,
    );
  } else if (shipments.length === 1) {
    explanation.push(`Shipped from ${shippedFrom(shipments[0])}. No warehouse can deliver the whole order.`);
  } else {
    explanation.push(
      `Split into ${shipments.length} shipments, because no warehouse can deliver the whole order. Each product comes from the nearest warehouse that has it.`,
    );
  }

  // Cold-chain exclusions, one line per warehouse. Products collected by van are explained
  // in the pickup lines instead.
  for (const warehouse of warehouses) {
    const products = coldChainExcluded
      .filter((e) => e.warehouseId === warehouse.id && pickedUp(warehouse.id, e.productId) === 0)
      .map((e) => name(e.productId));
    if (products.length === 0) continue;
    explanation.push(
      `${place(warehouse)} has ${joinList(products)} in stock but ${missingCapability(warehouse)}, so it cannot deliver cold-chain products.`,
    );
  }

  // Van pickups, one line per pickup
  for (const pickup of pickups) {
    const at = warehouse(pickup.warehouseId);
    const van = warehouse(pickup.vanFromWarehouseId!);
    const items = joinList(pickup.items.map((i) => `${i.quantity} ${name(i.productId)}`));
    explanation.push(
      `${place(at)} has no refrigerated fleet, and the other warehouses do not have enough stock. A refrigerated van from ${place(van)} collects ${items} at ${at.id} and delivers them. The trip is about ${pickup.distanceKm} km: at most ${van.distanceToCustomerKm} + ${at.distanceToCustomerKm} km to reach ${at.id}, because the distance between ${van.id} and ${at.id} is not known, then ${at.distanceToCustomerKm} km to the customer.`,
    );
  }

  // Transit, one line per transfer
  for (const { fromWarehouseId, toWarehouseId, productId, quantity } of transfers) {
    explanation.push(
      `${label(warehouse(fromWarehouseId))} sends ${quantity} ${name(productId)} to ${label(warehouse(toWarehouseId))}, which delivers them with the rest of its shipment. The distance between ${fromWarehouseId} and ${toWarehouseId} is not known and is not counted.`,
    );
  }

  // Allocation, one line per product
  for (const { productId } of lines) {
    const parts = selection.allocations
      .filter((a) => a.productId === productId)
      .map((a) => {
        if (a.van) {
          const pickup = pickups.find((s) => s.warehouseId === a.warehouse.id)!;
          return `${a.quantity} from ${shippedFrom(pickup)} by van from ${label(a.van)}`;
        }
        return a.warehouse === a.hub
          ? `${a.quantity} from ${place(a.warehouse)}`
          : `${a.quantity} from ${label(a.warehouse)} through ${place(a.hub)}`;
      });
    if (parts.length === 0) continue;
    explanation.push(`${name(productId)}: ${joinList(parts)}.`);
  }

  // Shortfall, one line per product
  for (const { productId, requested, available } of unfulfilled) {
    let line = `${name(productId)}: ${available} of ${requested} available, ${requested - available} missing.`;
    // Stock still left at warehouses that cannot deliver cold-chain products.
    const left = (warehouseId: string) =>
      stockOf(snapshot, warehouseId, productId) - pickedUp(warehouseId, productId);
    const blocked = coldChainExcluded.filter((e) => e.productId === productId && left(e.warehouseId) > 0);
    if (blocked.length > 0) {
      const held = blocked.reduce((sum, e) => sum + left(e.warehouseId), 0);
      const verb = blocked.length === 1 ? "has" : "have";
      line += ` ${joinList(blocked.map((e) => label(warehouse(e.warehouseId))))} ${verb} ${held} more in stock but cannot deliver cold-chain products.`;
    }
    explanation.push(line);
  }

  return explanation;
}
