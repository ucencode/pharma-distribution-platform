import { byDistance, eligibility } from "./eligibility";
import { explain } from "./explain";
import { select } from "./select";
import {
  OrderError,
  type Decision,
  type Order,
  type OrderLine,
  type Shipment,
  type Shortfall,
  type Snapshot,
  type Status,
} from "./types";

export { canShip } from "./eligibility";
export * from "./types";

// Rejects empty orders, unknown products and quantities that are not positive integers,
// then merges duplicate lines and sorts them by product ID.
export function normalise(order: Order, snapshot: Snapshot): OrderLine[] {
  if (order.items.length === 0) throw new OrderError("EMPTY_ORDER", "The order has no items.");

  const merged = new Map<string, number>();
  for (const { productId, quantity } of order.items) {
    if (!snapshot.products.has(productId)) {
      throw new OrderError("UNKNOWN_PRODUCT", `Unknown product ${productId}.`, productId);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new OrderError(
        "INVALID_QUANTITY",
        `Quantity for ${productId} must be a positive integer.`,
        productId,
      );
    }
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }

  return [...merged]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

// Selects the warehouse or warehouses for an order. The result is a quote: the snapshot
// is not changed.
export function evaluate(order: Order, snapshot: Snapshot): Decision {
  const lines = normalise(order, snapshot);
  const warehouses = byDistance(snapshot.warehouses);
  const { eligible, excluded } = eligibility(lines, warehouses, snapshot);
  const selection = select(lines, eligible, snapshot);

  // One shipment per warehouse, nearest first, items in product ID order.
  const shipments: Shipment[] = [];
  for (const warehouse of warehouses) {
    const items = selection.allocations
      .filter((a) => a.warehouse.id === warehouse.id)
      .map(({ productId, quantity }) => ({ productId, quantity }));
    if (items.length > 0) {
      shipments.push({ warehouseId: warehouse.id, distanceKm: warehouse.distanceToCustomerKm, items });
    }
  }

  const unfulfilled: Shortfall[] = [];
  for (const { productId, quantity } of lines) {
    const available = selection.allocations
      .filter((a) => a.productId === productId)
      .reduce((sum, a) => sum + a.quantity, 0);
    if (available < quantity) unfulfilled.push({ productId, requested: quantity, available });
  }

  const status: Status =
    shipments.length === 0 ? "UNFULFILLABLE" : unfulfilled.length > 0 ? "PARTIAL" : "FULL";

  // Distances have two decimals; rounding removes floating-point noise from the sum.
  const totalDistanceKm =
    Math.round(shipments.reduce((sum, s) => sum + s.distanceKm, 0) * 100) / 100;

  const explanation = explain(
    { lines, warehouses, selection, shipments, unfulfilled, excluded, status },
    snapshot,
  );

  return {
    status,
    shipments,
    unfulfilled,
    metrics: { shipmentCount: shipments.length, totalDistanceKm },
    explanation,
    excluded,
  };
}
