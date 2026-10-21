import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/lib/db/client";
import { inventory } from "@/lib/db/schema";
import { POST } from "@/app/api/orders/evaluate/route";

// The tests read the seed data and do not change it.
const json = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

afterAll(closeDb);

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
});
