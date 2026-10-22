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

type Body = {
  items: { productId: string; quantity: number }[];
  departure?: { day: string; time: string };
};
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
        "Nothing can be shipped: no warehouse that can deliver these products has them in stock.",
        "Test No Stock: 0 of 5 available, 5 missing.",
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

    it("fills Hepatitis B 120 with 12 vials collected at W02 by a van from W04", async () => {
      const decision = await evaluate({ items: [{ productId: "P002", quantity: 120 }] });
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
          approximate: true,
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

  it("moves a cold-chain product only between cold-chain warehouses and collects the rest by van", async () => {
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
      // of the warehouse without a refrigerated fleet is not moved to the hub; the 2 vials
      // still missing are collected there by a van from the hub (2 + 1 + 1 km).
      expect(decision.status).toBe("FULL");
      expect(decision.shipments).toEqual([
        {
          warehouseId: hub.id,
          distanceKm: 2,
          approximate: true,
          items: [{ productId: vaccine.id, quantity: 10 }],
        },
        {
          warehouseId: noFleet.id,
          distanceKm: 4,
          approximate: true,
          vanFromWarehouseId: hub.id,
          items: [{ productId: vaccine.id, quantity: 2 }],
        },
      ]);
      expect(decision.transfers).toEqual([
        { fromWarehouseId: other.id, toWarehouseId: hub.id, productId: vaccine.id, quantity: 4 },
      ]);
      expect(decision.unfulfilled).toEqual([]);
      expect(decision.excluded).toContainEqual({
        warehouseId: noFleet.id,
        productId: vaccine.id,
        reason: "NO_COLD_CHAIN",
      });
      expect(decision.explanation).toContain(
        `${other.id} sends 4 Test Transit Vaccine to ${hub.id}, which delivers them with the rest of its shipment. The distance between ${other.id} and ${hub.id} is not known and is not counted.`,
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
        "W02 (12 km) has Vaccine — Tetanus Toxoid (10-dose vial) in stock but no refrigerated fleet, so it cannot deliver cold-chain products.",
      );
    });

    it("ships a product without cold chain from a warehouse without cold storage", async () => {
      const decision = await evaluate({ items: [{ productId: "P001", quantity: 10 }] });
      expect(decision.shipments).toEqual([
        { warehouseId: "W01", distanceKm: 5, items: [{ productId: "P001", quantity: 10 }] },
      ]);
    });

    it("collects at W02 by van when only warehouses without a refrigerated fleet hold the product", async () => {
      const decision = await evaluate({ items: [{ productId: ids.coldChain, quantity: 20 }] });
      expect(decision.status).toBe("PARTIAL");
      expect(decision.shipments).toEqual([
        {
          warehouseId: "W02",
          distanceKm: 54,
          approximate: true,
          vanFromWarehouseId: "W04",
          items: [{ productId: ids.coldChain, quantity: 15 }],
        },
      ]);
      expect(decision.unfulfilled).toEqual([
        { productId: ids.coldChain, requested: 20, available: 15 },
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
      // W01 has no cold storage, so its stock is never collected.
      expect(decision.explanation).toEqual([
        "Shipped from W02 (about 54 km). No warehouse can deliver the whole order.",
        "W01 (5 km) has Test Cold Chain in stock but no cold storage and no refrigerated fleet, so it cannot deliver cold-chain products.",
        "W02 (12 km) has no refrigerated fleet, and the other warehouses do not have enough stock. A refrigerated van from W04 (30 km) collects 15 Test Cold Chain at W02 and delivers them. The trip is about 54 km: at most 30 + 12 km to reach W02, because the distance between W04 and W02 is not known, then 12 km to the customer.",
        "Test Cold Chain: 15 from W02 by van from W04 (about 54 km).",
        "Test Cold Chain: 15 of 20 available, 5 missing. W01 has 5 more in stock but cannot deliver cold-chain products.",
      ]);
    });
  });

  describe("delivery time warnings", () => {
    it("warns that W05 is slow on Fri–Sun", async () => {
      const decision = await evaluate({
        items: [{ productId: "P005", quantity: 400 }],
        departure: { day: "Fri", time: "14:00" },
      });
      expect(decision.shipments.map((s: { warehouseId: string }) => s.warehouseId)).toEqual(["W05"]);
      expect(decision.warnings).toEqual([
        "W05 is often slow on Fri–Sun: 175 min on average (3 trips), against 128 min at other times (2 trips).",
      ]);
    });

    it("warns that W01 is slow in weekday rush hour", async () => {
      const decision = await evaluate({
        items: [{ productId: "P001", quantity: 100 }],
        departure: { day: "Mon", time: "08:00" },
      });
      expect(decision.warnings).toEqual([
        "W01 is often slow in weekday rush hour (Mon–Fri, 07:00–09:00 and 16:00–19:00): 55 min on average (4 trips), against 14 min at other times (4 trips).",
      ]);
    });

    it("gives no warnings without a departure", async () => {
      const decision = await evaluate({ items: [{ productId: "P005", quantity: 400 }] });
      expect(decision.warnings).toEqual([]);
    });

    it("returns 400 for an invalid departure", async () => {
      const items = [{ productId: "P001", quantity: 1 }];
      expect((await POST(json({ items, departure: { day: "Funday", time: "08:00" } }))).status).toBe(400);
      expect((await POST(json({ items, departure: { day: "Mon", time: "25:00" } }))).status).toBe(400);
      expect((await POST(json({ items, departure: { day: "Mon" } }))).status).toBe(400);
    });
  });
});
