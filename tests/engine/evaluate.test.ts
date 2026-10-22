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
      "Shipped in full from W01 (5 km), the nearest warehouse with the whole order in stock.",
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
      "Split into 2 shipments, because no warehouse can deliver the whole order. Each product comes from the nearest warehouse that has it.",
      "W02 (12 km) has Vaccine — Hepatitis B (10-dose vial) in stock but no refrigerated fleet, so it cannot deliver cold-chain products.",
      "W06 (95 km) has Vaccine — Hepatitis B (10-dose vial) in stock but no refrigerated fleet, so it cannot deliver cold-chain products.",
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

  it("D: Hepatitis B 120 is filled with 12 vials collected at W02 by a van from W04", () => {
    const decision = evaluate(order(["P002", 120]), sampleSnapshot());

    expect(decision.status).toBe("FULL");
    expect(decision.shipments).toEqual([
      { warehouseId: "W04", distanceKm: 30, items: [{ productId: "P002", quantity: 40 }] },
      { warehouseId: "W07", distanceKm: 45, items: [{ productId: "P002", quantity: 8 }] },
      { warehouseId: "W08", distanceKm: 150, items: [{ productId: "P002", quantity: 60 }] },
      {
        warehouseId: "W02",
        distanceKm: 54,
        approximate: true,
        vanFromWarehouseId: "W04",
        items: [{ productId: "P002", quantity: 12 }],
      },
    ]);
    expect(decision.unfulfilled).toEqual([]);
    expect(decision.metrics).toEqual({ shipmentCount: 4, totalDistanceKm: 279, approximate: true });
    expect(decision.explanation).toEqual([
      "Split into 4 shipments, because no warehouse can deliver the whole order. Each product comes from the nearest warehouse that has it.",
      "W06 (95 km) has Vaccine — Hepatitis B (10-dose vial) in stock but no refrigerated fleet, so it cannot deliver cold-chain products.",
      "W02 (12 km) has no refrigerated fleet, and the other warehouses do not have enough stock. A refrigerated van from W04 (30 km) collects 12 Vaccine — Hepatitis B (10-dose vial) at W02 and delivers them. The trip is about 54 km: at most 30 + 12 km to reach W02, because the distance between W04 and W02 is not known, then 12 km to the customer.",
      "Vaccine — Hepatitis B (10-dose vial): 40 from W04 (30 km), 8 from W07 (45 km), 60 from W08 (150 km) and 12 from W02 by van from W04 (about 54 km).",
    ]);
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
        approximate: true,
        items: [
          { productId: "P001", quantity: 220 },
          { productId: "P003", quantity: 100 },
        ],
      },
    ]);
    expect(decision.transfers).toEqual([
      { fromWarehouseId: "W02", toWarehouseId: "W01", productId: "P001", quantity: 20 },
    ]);
    expect(decision.metrics).toEqual({ shipmentCount: 1, totalDistanceKm: 5, approximate: true });
    expect(decision.explanation).toEqual([
      "Shipped in one delivery from W01 (5 km). The Surabaya warehouses together have the whole order, so they combine their stock at W01.",
      "W02 sends 20 Surgical Gloves (Box of 100) to W01, which delivers them with the rest of its shipment. The distance between W02 and W01 is not known and is not counted.",
      "Surgical Gloves (Box of 100): 200 from W01 (5 km) and 20 from W02 through W01 (5 km).",
      "Disposable Syringe (Box of 50): 100 from W01 (5 km).",
    ]);
  });

  it("splits 600 gloves into 3 deliveries, with W02 going through W01", () => {
    const decision = evaluate(order(["P001", 600]), sampleSnapshot());

    expect(decision.shipments).toEqual([
      { warehouseId: "W01", distanceKm: 5, approximate: true, items: [{ productId: "P001", quantity: 250 }] },
      { warehouseId: "W03", distanceKm: 25, items: [{ productId: "P001", quantity: 300 }] },
      { warehouseId: "W07", distanceKm: 45, items: [{ productId: "P001", quantity: 50 }] },
    ]);
    expect(decision.transfers).toEqual([
      { fromWarehouseId: "W02", toWarehouseId: "W01", productId: "P001", quantity: 50 },
    ]);
    expect(decision.metrics).toEqual({ shipmentCount: 3, totalDistanceKm: 75, approximate: true });
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
        approximate: true,
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
      { warehouseId: "W01", distanceKm: 5, approximate: true, items: [{ productId: "P001", quantity: 300 }] },
    ]);
    expect(decision.transfers).toEqual([
      { fromWarehouseId: "W02", toWarehouseId: "W01", productId: "P001", quantity: 50 },
      { fromWarehouseId: "W09", toWarehouseId: "W01", productId: "P001", quantity: 50 },
    ]);
  });
});

describe("unfulfillable order", () => {
  it("allocates nothing when no eligible warehouse has stock and no refrigerated van exists", () => {
    const snapshot = sampleSnapshot();
    for (const id of ["W04", "W07", "W08"]) snapshot.stock.get(id)!.delete("P002");
    snapshot.warehouses = snapshot.warehouses.map((w) => ({ ...w, hasRefrigeratedFleet: false }));

    const decision = evaluate(order(["P002", 10]), snapshot);

    expect(decision.status).toBe("UNFULFILLABLE");
    expect(decision.shipments).toEqual([]);
    expect(decision.unfulfilled).toEqual([{ productId: "P002", requested: 10, available: 0 }]);
    expect(decision.metrics).toEqual({ shipmentCount: 0, totalDistanceKm: 0 });
    expect(decision.explanation.at(-1)).toBe(
      "Vaccine — Hepatitis B (10-dose vial): 0 of 10 available, 10 missing. W02 and W06 have 50 more in stock but cannot deliver cold-chain products.",
    );
  });
});

describe("van pickup", () => {
  it("collects at W02 and then W06 when the order is still short, nearest first", () => {
    const decision = evaluate(order(["P002", 200]), sampleSnapshot());

    expect(decision.status).toBe("PARTIAL");
    expect(decision.shipments.slice(3)).toEqual([
      {
        warehouseId: "W02",
        distanceKm: 54,
        approximate: true,
        vanFromWarehouseId: "W04",
        items: [{ productId: "P002", quantity: 30 }],
      },
      {
        warehouseId: "W06",
        distanceKm: 220,
        approximate: true,
        vanFromWarehouseId: "W04",
        items: [{ productId: "P002", quantity: 20 }],
      },
    ]);
    expect(decision.unfulfilled).toEqual([{ productId: "P002", requested: 200, available: 158 }]);
    // All stock at W02 and W06 is used, so the shortfall line has no "more in stock" note.
    expect(decision.explanation.at(-1)).toBe("Vaccine — Hepatitis B (10-dose vial): 158 of 200 available, 42 missing.");
  });

  it("is not used when the normal rule covers the order", () => {
    const decision = evaluate(order(["P002", 10]), sampleSnapshot());

    expect(decision.shipments).toEqual([
      { warehouseId: "W04", distanceKm: 30, items: [{ productId: "P002", quantity: 10 }] },
    ]);
    expect(decision.metrics).toEqual({ shipmentCount: 1, totalDistanceKm: 30 });
  });

  it("never collects at a warehouse without cold storage", () => {
    const snapshot = sampleSnapshot();
    snapshot.stock.get("W01")!.set("P002", 100);

    const decision = evaluate(order(["P002", 200]), snapshot);

    expect(decision.shipments.map((s) => s.warehouseId)).not.toContain("W01");
    expect(decision.explanation.at(-1)).toBe(
      "Vaccine — Hepatitis B (10-dose vial): 158 of 200 available, 42 missing. W01 has 100 more in stock but cannot deliver cold-chain products.",
    );
  });

  it("is not used for products without cold chain", () => {
    const decision = evaluate(order(["P001", 2000]), sampleSnapshot());

    expect(decision.status).toBe("PARTIAL");
    expect(decision.shipments.some((s) => s.vanFromWarehouseId)).toBe(false);
  });

  it("uses the nearest warehouse with a refrigerated fleet as the van", () => {
    const snapshot = sampleSnapshot();
    snapshot.warehouses = snapshot.warehouses.map((w) =>
      ["W04", "W07"].includes(w.id) ? { ...w, hasRefrigeratedFleet: false } : w,
    );

    const decision = evaluate(order(["P002", 100]), snapshot);

    // W08 (150 km) is the only warehouse left with a refrigerated fleet.
    expect(decision.shipments.find((s) => s.warehouseId === "W02")).toEqual({
      warehouseId: "W02",
      distanceKm: 174,
      approximate: true,
      vanFromWarehouseId: "W08",
      items: [{ productId: "P002", quantity: 30 }],
    });
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
