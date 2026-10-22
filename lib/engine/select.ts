import { byDistance, canShip, stockOf } from "./eligibility";
import type { OrderLine, Snapshot, Warehouse } from "./types";

// `warehouse` holds the stock; `hub` delivers it to the customer. They differ when the
// stock moves to another warehouse in the same city first. `van` is set on a van pickup.
export type Allocation = {
  warehouse: Warehouse;
  hub: Warehouse;
  van?: Warehouse;
  productId: string;
  quantity: number;
};

export type Selection = { mode: "SINGLE" | "SPLIT"; allocations: Allocation[] };

// The warehouses of one city, delivering to the customer through one hub.
type CityGroup = { hub: Warehouse; members: Warehouse[] };

// One group per city, ordered by the hub's distance. The hub is the nearest warehouse
// that can ship cold chain when the order has a cold-chain product and the city has
// such a warehouse; otherwise it is the nearest warehouse in the city.
function cityGroups(lines: OrderLine[], snapshot: Snapshot): CityGroup[] {
  const coldProduct = lines
    .map(({ productId }) => snapshot.products.get(productId)!)
    .find((p) => p.requiresColdChain);

  const byCity = new Map<string, Warehouse[]>();
  for (const warehouse of byDistance(snapshot.warehouses)) {
    byCity.set(warehouse.city, [...(byCity.get(warehouse.city) ?? []), warehouse]);
  }

  const groups = [...byCity.values()].map((members) => ({
    hub: (coldProduct && members.find((w) => canShip(coldProduct, w))) || members[0],
    members,
  }));
  const hubOrder = byDistance(groups.map((g) => g.hub));
  return groups.sort((a, b) => hubOrder.indexOf(a.hub) - hubOrder.indexOf(b.hub));
}

// The warehouses of a group that supply a product: the hub first, then the other
// eligible members, nearest first. A cold-chain product moves only between warehouses
// that can ship cold chain, so the hub must be able to ship the product too.
function sources(group: CityGroup, productId: string, eligible: Map<string, Warehouse[]>, snapshot: Snapshot) {
  if (!canShip(snapshot.products.get(productId)!, group.hub)) return [];
  const list = eligible.get(productId)!;
  return [group.hub, ...group.members.filter((w) => w !== group.hub)].filter((w) => list.includes(w));
}

// Fallback for a cold-chain product that is still short. A refrigerated van from the
// nearest warehouse with a refrigerated fleet collects the product at warehouses that
// have cold storage but no refrigerated fleet, nearest first.
function pickups(productId: string, quantity: number, snapshot: Snapshot): Allocation[] {
  if (!snapshot.products.get(productId)!.requiresColdChain) return [];
  const warehouses = byDistance(snapshot.warehouses);
  const van = warehouses.find((w) => w.hasRefrigeratedFleet);
  if (!van) return [];

  const allocations: Allocation[] = [];
  for (const warehouse of warehouses) {
    if (quantity === 0) break;
    if (!warehouse.hasColdStorage || warehouse.hasRefrigeratedFleet) continue;
    const taken = Math.min(quantity, stockOf(snapshot, warehouse.id, productId));
    if (taken === 0) continue;
    allocations.push({ warehouse, hub: warehouse, van, productId, quantity: taken });
    quantity -= taken;
  }
  return allocations;
}

export function select(
  lines: OrderLine[],
  eligible: Map<string, Warehouse[]>,
  snapshot: Snapshot,
): Selection {
  const groups = cityGroups(lines, snapshot);
  const supply = (group: CityGroup, productId: string) => sources(group, productId, eligible, snapshot);

  // Takes up to `quantity` of a product from a group and returns the allocations.
  const take = (group: CityGroup, productId: string, quantity: number) => {
    const allocations: Allocation[] = [];
    for (const warehouse of supply(group, productId)) {
      if (quantity === 0) break;
      const taken = Math.min(quantity, stockOf(snapshot, warehouse.id, productId));
      allocations.push({ warehouse, hub: group.hub, productId, quantity: taken });
      quantity -= taken;
    }
    return allocations;
  };

  // The nearest group that holds the full quantity of every line delivers the whole order.
  const single = groups.find((group) =>
    lines.every(
      ({ productId, quantity }) =>
        supply(group, productId).reduce((sum, w) => sum + stockOf(snapshot, w.id, productId), 0) >= quantity,
    ),
  );
  if (single) {
    return {
      mode: "SINGLE",
      allocations: lines.flatMap(({ productId, quantity }) => take(single, productId, quantity)),
    };
  }

  // Each product is taken from its nearest group first, then the next nearest. A cold-chain
  // product that is still short is then collected by van, if possible.
  const allocations: Allocation[] = [];
  for (const { productId, quantity } of lines) {
    let remaining = quantity;
    for (const group of groups) {
      if (remaining === 0) break;
      const taken = take(group, productId, remaining);
      allocations.push(...taken);
      remaining -= taken.reduce((sum, a) => sum + a.quantity, 0);
    }
    if (remaining > 0) allocations.push(...pickups(productId, remaining, snapshot));
  }
  return { mode: "SPLIT", allocations };
}
