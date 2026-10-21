import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/lib/db/client";
import { inventory, products, warehouses } from "@/lib/db/schema";
import { POST } from "@/app/api/orders/evaluate/route";

// The tests use the seed data and do not change it. Two test products are added for the
// cases the seed data does not cover, and deleted with their stock afterwards:
// - noStock: no stock in any warehouse.
// - coldChain: a cold-chain product held only by W01 (no cold storage, no refrigerated
//   fleet) and W02 (cold storage, no refrigerated fleet).
const ids = { noStock: "", coldChain: "" };
const seedWarehouses = ["W01", "W02", "W03", "W04", "W05", "W06", "W07", "W08"];

const json = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

type Body = { items: { productId: string; quantity: number }[] };
const evaluate = async (body: Body) => {
  const res = await POST(json(body));
  expect(res.status).toBe(200);
  return res.json();
};

beforeAll(async () => {
  const [noStock, coldChain] = await db
    .insert(products)
    .values([
      { name: "Test No Stock", categoryId: "C01", requiresColdChain: false },
      { name: "Test Cold Chain", categoryId: "C02", requiresColdChain: true },
    ])
    .returning();
  ids.noStock = noStock.id;
  ids.coldChain = coldChain.id;
  await db.insert(inventory).values([
    { warehouseId: "W01", productId: ids.coldChain, quantity: 5 },
    { warehouseId: "W02", productId: ids.coldChain, quantity: 15 },
  ]);
});

afterAll(async () => {
  await db.delete(inventory).where(eq(inventory.productId, ids.coldChain));
  await db.delete(products).where(inArray(products.id, [ids.noStock, ids.coldChain]));
  await closeDb();
});

describe("POST /api/orders/evaluate", () => {
  it("splits gloves and Hepatitis B vaccine across W01 and W04", async () => {
    const res = await POST(
      json({
        items: [
          { productId: "P001", quantity: 100 },
          { productId: "P002", quantity: 10 },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const decision = await res.json();
    expect(decision.status).toBe("FULL");
    expect(decision.shipments).toEqual([
      { warehouseId: "W01", distanceKm: 5, items: [{ productId: "P001", quantity: 100 }] },
      { warehouseId: "W04", distanceKm: 30, items: [{ productId: "P002", quantity: 10 }] },
    ]);
    expect(decision.unfulfilled).toEqual([]);
    expect(decision.metrics).toEqual({ shipmentCount: 2, totalDistanceKm: 35 });
    expect(decision.excluded).toContainEqual({
      warehouseId: "W02",
      productId: "P002",
      reason: "NO_COLD_CHAIN",
    });
  });

  it("does not change the stock", async () => {
    const before = await db.select().from(inventory);
    await POST(json({ items: [{ productId: "P002", quantity: 120 }] }));
    expect(await db.select().from(inventory)).toEqual(before);
  });

  it("returns 422 for an unknown product", async () => {
    const res = await POST(json({ items: [{ productId: "TEST-MISSING", quantity: 1 }] }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      code: "UNKNOWN_PRODUCT",
      productId: "TEST-MISSING",
    });
  });

  it("returns 400 for invalid input and malformed JSON", async () => {
    expect((await POST(json({ items: [] }))).status).toBe(400);
    expect((await POST(json({ items: [{ productId: "P001", quantity: 0 }] }))).status).toBe(400);
    expect((await POST(json({ items: [{ productId: "P001", quantity: 1.5 }] }))).status).toBe(400);
    expect((await POST(json("not json"))).status).toBe(400);
  });

  describe("orders that cannot be fulfilled in full", () => {
    it("returns UNFULFILLABLE for a product without stock", async () => {
      const decision = await evaluate({ items: [{ productId: ids.noStock, quantity: 5 }] });
      expect(decision.status).toBe("UNFULFILLABLE");
      expect(decision.shipments).toEqual([]);
      expect(decision.unfulfilled).toEqual([
        { productId: ids.noStock, requested: 5, available: 0 },
      ]);
      expect(decision.metrics).toEqual({ shipmentCount: 0, totalDistanceKm: 0 });
      for (const warehouseId of seedWarehouses) {
        expect(decision.excluded).toContainEqual({
          warehouseId,
          productId: ids.noStock,
          reason: "NO_STOCK",
        });
      }
      expect(decision.explanation).toEqual([
        "No eligible warehouse has stock of the ordered products, so nothing can be shipped.",
        "Test No Stock: 0 of 5 can be shipped, 5 short.",
      ]);
    });

    it("returns PARTIAL and ships what is in stock when one product has no stock", async () => {
      const decision = await evaluate({
        items: [
          { productId: "P001", quantity: 10 },
          { productId: ids.noStock, quantity: 5 },
        ],
      });
      expect(decision.status).toBe("PARTIAL");
      expect(decision.shipments).toEqual([
        { warehouseId: "W01", distanceKm: 5, items: [{ productId: "P001", quantity: 10 }] },
      ]);
      expect(decision.unfulfilled).toEqual([
        { productId: ids.noStock, requested: 5, available: 0 },
      ]);
    });

    it("returns PARTIAL when the total stock is lower than the quantity", async () => {
      const decision = await evaluate({ items: [{ productId: "P002", quantity: 120 }] });
      expect(decision.status).toBe("PARTIAL");
      expect(decision.shipments).toEqual([
        { warehouseId: "W04", distanceKm: 30, items: [{ productId: "P002", quantity: 40 }] },
        { warehouseId: "W07", distanceKm: 45, items: [{ productId: "P002", quantity: 8 }] },
        { warehouseId: "W08", distanceKm: 150, items: [{ productId: "P002", quantity: 60 }] },
      ]);
      expect(decision.unfulfilled).toEqual([{ productId: "P002", requested: 120, available: 108 }]);
      expect(decision.metrics).toEqual({ shipmentCount: 3, totalDistanceKm: 225 });
      expect(decision.explanation).toContain(
        "Vaccine — Hepatitis B (10-dose vial): 108 of 120 can be shipped, 12 short. W02 and W06 hold 50 more but cannot deliver cold-chain products.",
      );
    });
  });

  it("delivers gloves and syringes once from W01, with W02's gloves moved to W01 first", async () => {
    const decision = await evaluate({
      items: [
        { productId: "P001", quantity: 220 },
        { productId: "P003", quantity: 100 },
      ],
    });
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
  });

  it("uses a cold-chain warehouse in Surabaya as the hub when the order has a cold-chain product", async () => {
    // A cold-chain warehouse in Surabaya changes the hub for every cold-chain order, so it
    // exists only during this test.
    const [hub] = await db
      .insert(warehouses)
      .values({
        city: "Surabaya",
        distanceToCustomerKm: 15,
        hasColdStorage: true,
        hasRefrigeratedFleet: true,
      })
      .returning();
    const [vaccine] = await db
      .insert(products)
      .values({ name: "Test Hub Vaccine", categoryId: "C02", requiresColdChain: true })
      .returning();
    try {
      await db.insert(inventory).values({ warehouseId: hub.id, productId: vaccine.id, quantity: 10 });

      const decision = await evaluate({
        items: [
          { productId: "P001", quantity: 100 },
          { productId: vaccine.id, quantity: 10 },
        ],
      });
      expect(decision.status).toBe("FULL");
      expect(decision.shipments).toEqual([
        {
          warehouseId: hub.id,
          distanceKm: 15,
          items: [
            { productId: "P001", quantity: 100 },
            { productId: vaccine.id, quantity: 10 },
          ],
        },
      ]);
      expect(decision.transfers).toEqual([
        { fromWarehouseId: "W01", toWarehouseId: hub.id, productId: "P001", quantity: 100 },
      ]);
    } finally {
      await db.delete(inventory).where(eq(inventory.warehouseId, hub.id));
      await db.delete(products).where(eq(products.id, vaccine.id));
      await db.delete(warehouses).where(eq(warehouses.id, hub.id));
    }
  });

  it("moves a cold-chain product only between cold-chain warehouses of the same city", async () => {
    // One city with three warehouses: the nearest has no cold chain, the other two do.
    // They hold only a test product, so other orders are not affected.
    const created = await db
      .insert(warehouses)
      .values([
        { city: "Test Transit City", distanceToCustomerKm: 1, hasColdStorage: true, hasRefrigeratedFleet: false },
        { city: "Test Transit City", distanceToCustomerKm: 2, hasColdStorage: true, hasRefrigeratedFleet: true },
        { city: "Test Transit City", distanceToCustomerKm: 3, hasColdStorage: true, hasRefrigeratedFleet: true },
      ])
      .returning();
    const [noFleet, hub, other] = created;
    const [vaccine] = await db
      .insert(products)
      .values({ name: "Test Transit Vaccine", categoryId: "C02", requiresColdChain: true })
      .returning();
    try {
      await db.insert(inventory).values([
        { warehouseId: noFleet.id, productId: vaccine.id, quantity: 5 },
        { warehouseId: hub.id, productId: vaccine.id, quantity: 6 },
        { warehouseId: other.id, productId: vaccine.id, quantity: 4 },
      ]);

      const decision = await evaluate({ items: [{ productId: vaccine.id, quantity: 12 }] });

      // The hub is the nearest cold-chain warehouse, not the nearest warehouse. The stock
      // of the warehouse without a refrigerated fleet is not moved.
      expect(decision.status).toBe("PARTIAL");
      expect(decision.shipments).toEqual([
        { warehouseId: hub.id, distanceKm: 2, items: [{ productId: vaccine.id, quantity: 10 }] },
      ]);
      expect(decision.transfers).toEqual([
        { fromWarehouseId: other.id, toWarehouseId: hub.id, productId: vaccine.id, quantity: 4 },
      ]);
      expect(decision.unfulfilled).toEqual([{ productId: vaccine.id, requested: 12, available: 10 }]);
      expect(decision.excluded).toContainEqual({
        warehouseId: noFleet.id,
        productId: vaccine.id,
        reason: "NO_COLD_CHAIN",
      });
      expect(decision.explanation).toContain(
        `${other.id} sends 4 Test Transit Vaccine to ${hub.id} for transit. ${hub.id} delivers them to the customer.`,
      );
    } finally {
      await db.delete(inventory).where(eq(inventory.productId, vaccine.id));
      await db.delete(products).where(eq(products.id, vaccine.id));
      await db.delete(warehouses).where(inArray(warehouses.id, created.map((w) => w.id)));
    }
  });

  describe("cold chain", () => {
    it("ships a vaccine from W04 and skips the nearer W02, which has no refrigerated fleet", async () => {
      const decision = await evaluate({ items: [{ productId: "P004", quantity: 10 }] });
      expect(decision.status).toBe("FULL");
      expect(decision.shipments).toEqual([
        { warehouseId: "W04", distanceKm: 30, items: [{ productId: "P004", quantity: 10 }] },
      ]);
      expect(decision.excluded).toContainEqual({
        warehouseId: "W02",
        productId: "P004",
        reason: "NO_COLD_CHAIN",
      });
      expect(decision.excluded).toContainEqual({
        warehouseId: "W06",
        productId: "P004",
        reason: "NO_COLD_CHAIN",
      });
      expect(decision.explanation).toContain(
        "W02 (12 km) holds Vaccine — Tetanus Toxoid (10-dose vial) but has no refrigerated fleet, so it cannot deliver cold-chain products.",
      );
    });

    it("ships a product without cold chain from a warehouse without cold storage", async () => {
      const decision = await evaluate({ items: [{ productId: "P001", quantity: 10 }] });
      expect(decision.shipments).toEqual([
        { warehouseId: "W01", distanceKm: 5, items: [{ productId: "P001", quantity: 10 }] },
      ]);
    });

    it("returns UNFULFILLABLE when only warehouses without cold chain hold the product", async () => {
      const decision = await evaluate({ items: [{ productId: ids.coldChain, quantity: 10 }] });
      expect(decision.status).toBe("UNFULFILLABLE");
      expect(decision.shipments).toEqual([]);
      expect(decision.unfulfilled).toEqual([
        { productId: ids.coldChain, requested: 10, available: 0 },
      ]);
      expect(decision.excluded).toContainEqual({
        warehouseId: "W01",
        productId: ids.coldChain,
        reason: "NO_COLD_CHAIN",
      });
      expect(decision.excluded).toContainEqual({
        warehouseId: "W02",
        productId: ids.coldChain,
        reason: "NO_COLD_CHAIN",
      });
      expect(decision.explanation).toEqual([
        "No eligible warehouse has stock of the ordered products, so nothing can be shipped.",
        "W01 (5 km) holds Test Cold Chain but has no cold storage and no refrigerated fleet, so it cannot deliver cold-chain products.",
        "W02 (12 km) holds Test Cold Chain but has no refrigerated fleet, so it cannot deliver cold-chain products.",
        "Test Cold Chain: 0 of 10 can be shipped, 10 short. W01 and W02 hold 20 more but cannot deliver cold-chain products.",
      ]);
    });
  });
});
