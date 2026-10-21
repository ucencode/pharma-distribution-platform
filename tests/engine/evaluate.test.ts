import { describe, expect, it } from "vitest";
import { canShip, evaluate, OrderError, type Order } from "@/lib/engine";
import { sampleSnapshot } from "./sample";

const order = (...items: [string, number][]): Order => ({
  items: items.map(([productId, quantity]) => ({ productId, quantity })),
});

const coldChainExclusions = (excluded: { warehouseId: string; productId: string; reason: string }[]) =>
  excluded.filter((e) => e.reason === "NO_COLD_CHAIN");

describe("canShip", () => {
  const snapshot = sampleSnapshot();
  const vaccine = snapshot.products.get("P002")!;
  const gloves = snapshot.products.get("P001")!;
  const warehouse = (id: string) => snapshot.warehouses.find((w) => w.id === id)!;

  it("needs cold storage and a refrigerated fleet for cold-chain products", () => {
    expect(canShip(vaccine, warehouse("W04"))).toBe(true);
    expect(canShip(vaccine, warehouse("W02"))).toBe(false);
    expect(canShip(vaccine, warehouse("W01"))).toBe(false);
  });

  it("allows any warehouse for other products", () => {
    expect(canShip(gloves, warehouse("W01"))).toBe(true);
    expect(canShip(gloves, warehouse("W02"))).toBe(true);
  });
});

describe("worked examples", () => {
  it("A: one warehouse supplies the whole order", () => {
    const decision = evaluate(order(["P001", 100], ["P003", 100], ["P005", 50]), sampleSnapshot());

    expect(decision.status).toBe("FULL");
    expect(decision.shipments).toEqual([
      {
        warehouseId: "W01",
        distanceKm: 5,
        items: [
          { productId: "P001", quantity: 100 },
          { productId: "P003", quantity: 100 },
          { productId: "P005", quantity: 50 },
        ],
      },
    ]);
    expect(decision.unfulfilled).toEqual([]);
    expect(decision.metrics).toEqual({ shipmentCount: 1, totalDistanceKm: 5 });
    expect(decision.explanation[0]).toBe(
      "Fulfilled from 1 warehouse (W01, 5 km), the nearest warehouse that can supply the whole order.",
    );
  });

  it("B: gloves and Hepatitis B are split because W02 cannot deliver cold-chain products", () => {
    const decision = evaluate(order(["P001", 100], ["P002", 10]), sampleSnapshot());

    expect(decision.status).toBe("FULL");
    expect(decision.shipments).toEqual([
      { warehouseId: "W01", distanceKm: 5, items: [{ productId: "P001", quantity: 100 }] },
      { warehouseId: "W04", distanceKm: 30, items: [{ productId: "P002", quantity: 10 }] },
    ]);
    expect(decision.metrics).toEqual({ shipmentCount: 2, totalDistanceKm: 35 });
    expect(coldChainExclusions(decision.excluded)).toEqual([
      { warehouseId: "W02", productId: "P002", reason: "NO_COLD_CHAIN" },
      { warehouseId: "W06", productId: "P002", reason: "NO_COLD_CHAIN" },
    ]);
    expect(decision.excluded).toContainEqual({ warehouseId: "W01", productId: "P002", reason: "NO_STOCK" });
    expect(decision.explanation).toEqual([
      "Split across 2 warehouses because no single warehouse can supply the whole order. Each product is taken from the nearest eligible warehouse first.",
      "W02 (12 km) holds Vaccine — Hepatitis B (10-dose vial) but has no refrigerated fleet, so it cannot deliver cold-chain products.",
      "W06 (95 km) holds Vaccine — Hepatitis B (10-dose vial) but has no refrigerated fleet, so it cannot deliver cold-chain products.",
      "Surgical Gloves (Box of 100): 100 from W01 (5 km).",
      "Vaccine — Hepatitis B (10-dose vial): 10 from W04 (30 km).",
    ]);
  });

  it("C: both vaccines come from the nearest cold-chain warehouse", () => {
    const decision = evaluate(order(["P002", 10], ["P004", 10]), sampleSnapshot());

    expect(decision.status).toBe("FULL");
    expect(decision.shipments).toEqual([
      {
        warehouseId: "W04",
        distanceKm: 30,
        items: [
          { productId: "P002", quantity: 10 },
          { productId: "P004", quantity: 10 },
        ],
      },
    ]);
  });

  it("D: Hepatitis B 120 is partial, short 12", () => {
    const decision = evaluate(order(["P002", 120]), sampleSnapshot());

    expect(decision.status).toBe("PARTIAL");
    expect(decision.shipments).toEqual([
      { warehouseId: "W04", distanceKm: 30, items: [{ productId: "P002", quantity: 40 }] },
      { warehouseId: "W07", distanceKm: 45, items: [{ productId: "P002", quantity: 8 }] },
      { warehouseId: "W08", distanceKm: 150, items: [{ productId: "P002", quantity: 60 }] },
    ]);
    expect(decision.unfulfilled).toEqual([{ productId: "P002", requested: 120, available: 108 }]);
    expect(decision.metrics).toEqual({ shipmentCount: 3, totalDistanceKm: 225 });
    expect(decision.explanation.at(-1)).toBe(
      "Vaccine — Hepatitis B (10-dose vial): 108 of 120 can be shipped, 12 short. W02 and W06 hold 50 more but cannot deliver cold-chain products.",
    );
  });
});

describe("same-city transit", () => {
  it("delivers from W01 once when W01 and W02 in Surabaya together cover the order", () => {
    const decision = evaluate(order(["P001", 220], ["P003", 100]), sampleSnapshot());

    expect(decision.status).toBe("FULL");
    expect(decision.shipments).toEqual([
      {
        warehouseId: "W01",
        distanceKm: 5,
        items: [
          { productId: "P001", quantity: 220 },
          { productId: "P003", quantity: 100 },
        ],
      },
    ]);
    expect(decision.transfers).toEqual([
      { fromWarehouseId: "W02", toWarehouseId: "W01", productId: "P001", quantity: 20 },
    ]);
    expect(decision.metrics).toEqual({ shipmentCount: 1, totalDistanceKm: 5 });
    expect(decision.explanation).toEqual([
      "Fulfilled with 1 delivery from W01 (5 km). Warehouses in Surabaya together supply the whole order.",
      "W02 sends 20 Surgical Gloves (Box of 100) to W01 for transit. W01 delivers them to the customer.",
      "Surgical Gloves (Box of 100): 200 from W01 (5 km) and 20 from W02 through W01 (5 km).",
      "Disposable Syringe (Box of 50): 100 from W01 (5 km).",
    ]);
  });

  it("splits 600 gloves into 3 deliveries, with W02 going through W01", () => {
    const decision = evaluate(order(["P001", 600]), sampleSnapshot());

    expect(decision.shipments).toEqual([
      { warehouseId: "W01", distanceKm: 5, items: [{ productId: "P001", quantity: 250 }] },
      { warehouseId: "W03", distanceKm: 25, items: [{ productId: "P001", quantity: 300 }] },
      { warehouseId: "W07", distanceKm: 45, items: [{ productId: "P001", quantity: 50 }] },
    ]);
    expect(decision.transfers).toEqual([
      { fromWarehouseId: "W02", toWarehouseId: "W01", productId: "P001", quantity: 50 },
    ]);
    expect(decision.metrics).toEqual({ shipmentCount: 3, totalDistanceKm: 75 });
  });

  it("does not move cold-chain products to or from a warehouse without cold chain", () => {
    const decision = evaluate(order(["P001", 100], ["P002", 10]), sampleSnapshot());

    expect(decision.transfers).toEqual([]);
    expect(decision.shipments.map((s) => s.warehouseId)).toEqual(["W01", "W04"]);
  });

  it("uses the cold-chain warehouse of the city as the hub when the order has a cold-chain product", () => {
    const snapshot = sampleSnapshot();
    snapshot.warehouses.push({
      id: "W09",
      city: "Surabaya",
      distanceToCustomerKm: 15,
      hasColdStorage: true,
      hasRefrigeratedFleet: true,
    });
    snapshot.stock.set("W09", new Map([["P002", 10]]));

    const decision = evaluate(order(["P001", 100], ["P002", 10]), snapshot);

    expect(decision.shipments).toEqual([
      {
        warehouseId: "W09",
        distanceKm: 15,
        items: [
          { productId: "P001", quantity: 100 },
          { productId: "P002", quantity: 10 },
        ],
      },
    ]);
    expect(decision.transfers).toEqual([
      { fromWarehouseId: "W01", toWarehouseId: "W09", productId: "P001", quantity: 100 },
    ]);
  });

  it("uses the nearest warehouse of the city as the hub when the order has no cold-chain product", () => {
    const snapshot = sampleSnapshot();
    snapshot.warehouses.push({
      id: "W09",
      city: "Surabaya",
      distanceToCustomerKm: 15,
      hasColdStorage: true,
      hasRefrigeratedFleet: true,
    });
    snapshot.stock.set("W09", new Map([["P001", 100]]));

    const decision = evaluate(order(["P001", 300]), snapshot);

    expect(decision.shipments).toEqual([
      { warehouseId: "W01", distanceKm: 5, items: [{ productId: "P001", quantity: 300 }] },
    ]);
    expect(decision.transfers).toEqual([
      { fromWarehouseId: "W02", toWarehouseId: "W01", productId: "P001", quantity: 50 },
      { fromWarehouseId: "W09", toWarehouseId: "W01", productId: "P001", quantity: 50 },
    ]);
  });
});

describe("unfulfillable order", () => {
  it("allocates nothing when no eligible warehouse has stock", () => {
    const snapshot = sampleSnapshot();
    for (const id of ["W04", "W07", "W08"]) snapshot.stock.get(id)!.delete("P002");

    const decision = evaluate(order(["P002", 10]), snapshot);

    expect(decision.status).toBe("UNFULFILLABLE");
    expect(decision.shipments).toEqual([]);
    expect(decision.unfulfilled).toEqual([{ productId: "P002", requested: 10, available: 0 }]);
    expect(decision.metrics).toEqual({ shipmentCount: 0, totalDistanceKm: 0 });
  });
});

describe("validation", () => {
  const rejects = (o: Order, code: string) => {
    expect(() => evaluate(o, sampleSnapshot())).toThrow(OrderError);
    expect(() => evaluate(o, sampleSnapshot())).toThrow(expect.objectContaining({ code }));
  };

  it("merges duplicate lines", () => {
    const decision = evaluate(order(["P001", 60], ["P001", 40]), sampleSnapshot());
    expect(decision.shipments[0].items).toEqual([{ productId: "P001", quantity: 100 }]);
  });

  it("rejects an empty order", () => rejects(order(), "EMPTY_ORDER"));
  it("rejects an unknown product", () => rejects(order(["P999", 1]), "UNKNOWN_PRODUCT"));
  it("rejects a zero quantity", () => rejects(order(["P001", 0]), "INVALID_QUANTITY"));
  it("rejects a negative quantity", () => rejects(order(["P001", -5]), "INVALID_QUANTITY"));
  it("rejects a non-integer quantity", () => rejects(order(["P001", 1.5]), "INVALID_QUANTITY"));

  it("checks each line before merging", () => {
    rejects(order(["P001", 10], ["P001", -5]), "INVALID_QUANTITY");
  });
});

describe("determinism", () => {
  it("gives identical output for shuffled order lines and warehouses", () => {
    const items: [string, number][] = [["P001", 100], ["P002", 120], ["P004", 10], ["P005", 50]];
    const first = evaluate(order(...items), sampleSnapshot());

    const shuffled = sampleSnapshot();
    shuffled.warehouses.reverse();
    const second = evaluate(order(...[...items].reverse()), shuffled);

    expect(second).toEqual(first);
    expect(evaluate(order(...items), sampleSnapshot())).toEqual(first);
  });
});
