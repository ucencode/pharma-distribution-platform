import { slowWarnings } from "./delivery";
import { byDistance, eligibility } from "./eligibility";
import { explain } from "./explain";
import { select, type Allocation } from "./select";
import {
  OrderError,
  type Decision,
  type Order,
  type OrderLine,
  type Shipment,
  type Shortfall,
  type Transfer,
  type Snapshot,
  type Status,
} from "./types";

export { DAYS } from "./delivery";
export { canShip } from "./eligibility";
export * from "./types";

// Distances have two decimals; rounding removes floating-point noise from sums.
const round = (km: number) => Math.round(km * 100) / 100;

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

  const delivered = selection.allocations.filter((a) => !a.van);
  const pickedUp = selection.allocations.filter((a) => a.van);
  const itemsOf = (allocations: Allocation[]) =>
    lines
      .map(({ productId }) => ({
        productId,
        quantity: allocations
          .filter((a) => a.productId === productId)
          .reduce((sum, a) => sum + a.quantity, 0),
      }))
      .filter((item) => item.quantity > 0);

  // One shipment per hub, nearest first, items in product ID order. The distance of a
  // transfer to the hub is not known, so a hub with a transfer has an approximate distance.
  const shipments: Shipment[] = [];
  for (const hub of warehouses) {
    const allocations = delivered.filter((a) => a.hub.id === hub.id);
    const items = itemsOf(allocations);
    if (items.length === 0) continue;
    const transfer = allocations.some((a) => a.warehouse.id !== hub.id);
    shipments.push({
      warehouseId: hub.id,
      distanceKm: hub.distanceToCustomerKm,
      ...(transfer && { approximate: true as const }),
      items,
    });
  }

  // Then one van pickup per warehouse, nearest first. The van drives to the warehouse
  // (at most its own distance plus the warehouse's distance, through the customer) and
  // then to the customer.
  for (const warehouse of warehouses) {
    const allocations = pickedUp.filter((a) => a.warehouse.id === warehouse.id);
    if (allocations.length === 0) continue;
    const van = allocations[0].van!;
    shipments.push({
      warehouseId: warehouse.id,
      distanceKm: round(van.distanceToCustomerKm + 2 * warehouse.distanceToCustomerKm),
      approximate: true,
      vanFromWarehouseId: van.id,
      items: itemsOf(allocations),
    });
  }

  const transfers: Transfer[] = delivered
    .filter((a) => a.warehouse.id !== a.hub.id)
    .map((a) => ({
      fromWarehouseId: a.warehouse.id,
      toWarehouseId: a.hub.id,
      productId: a.productId,
      quantity: a.quantity,
    }));

  const unfulfilled: Shortfall[] = [];
  for (const { productId, quantity } of lines) {
    const available = selection.allocations
      .filter((a) => a.productId === productId)
      .reduce((sum, a) => sum + a.quantity, 0);
    if (available < quantity) unfulfilled.push({ productId, requested: quantity, available });
  }

  const status: Status =
    shipments.length === 0 ? "UNFULFILLABLE" : unfulfilled.length > 0 ? "PARTIAL" : "FULL";

  const totalDistanceKm = round(shipments.reduce((sum, s) => sum + s.distanceKm, 0));
  const approximate = shipments.some((s) => s.approximate);

  const explanation = explain(
    { lines, warehouses, selection, shipments, transfers, unfulfilled, excluded, status },
    snapshot,
  );

  return {
    status,
    shipments,
    transfers,
    unfulfilled,
    metrics: {
      shipmentCount: shipments.length,
      totalDistanceKm,
      ...(approximate && { approximate: true as const }),
    },
    explanation,
    excluded,
    warnings: order.departure ? slowWarnings(shipments, warehouses, snapshot.deliveries, order.departure) : [],
  };
}
