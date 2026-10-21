import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/lib/db/client";
import { categories, inventory, products, warehouses } from "@/lib/db/schema";
import * as categoryList from "@/app/api/categories/route";
import * as categoryItem from "@/app/api/categories/[id]/route";
import * as productList from "@/app/api/products/route";
import * as productItem from "@/app/api/products/[id]/route";
import * as warehouseList from "@/app/api/warehouses/route";
import * as warehouseItem from "@/app/api/warehouses/[id]/route";
import * as inventoryList from "@/app/api/inventory/route";
import * as inventoryItem from "@/app/api/inventory/[warehouseId]/[productId]/route";

// Records created by these tests use IDs that do not exist in the seed data.
const CATEGORY = "TEST-C1";
const PRODUCT = "TEST-P1";
const WAREHOUSE = "TEST-W1";

const json = (body: unknown) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const empty = new Request("http://test");
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

async function cleanUp() {
  await db.delete(inventory).where(eq(inventory.warehouseId, WAREHOUSE));
  await db.delete(products).where(eq(products.id, PRODUCT));
  await db.delete(warehouses).where(eq(warehouses.id, WAREHOUSE));
  await db.delete(categories).where(eq(categories.id, CATEGORY));
}

afterAll(async () => {
  await cleanUp();
  await closeDb();
});

describe("categories", () => {
  const ctx = params({ id: CATEGORY });

  it("creates, reads, lists and updates a category", async () => {
    const created = await categoryList.POST(json({ id: CATEGORY, name: "Test Category" }));
    expect(created.status).toBe(201);

    const read = await categoryItem.GET(empty, ctx);
    expect(await read.json()).toEqual({ id: CATEGORY, name: "Test Category" });

    const list = await (await categoryList.GET()).json();
    expect(list).toContainEqual({ id: CATEGORY, name: "Test Category" });

    const updated = await categoryItem.PATCH(json({ name: "Test Category 2" }), ctx);
    expect(await updated.json()).toEqual({ id: CATEGORY, name: "Test Category 2" });
  });

  it("rejects invalid input, empty updates and duplicates", async () => {
    expect((await categoryList.POST(json({ id: "", name: "" }))).status).toBe(400);
    expect((await categoryList.POST(json("not json"))).status).toBe(400);
    expect((await categoryItem.PATCH(json({}), ctx)).status).toBe(400);
    expect((await categoryList.POST(json({ id: CATEGORY, name: "Other" }))).status).toBe(409);
  });

  it("returns 404 for a missing category", async () => {
    const missing = params({ id: "TEST-MISSING" });
    expect((await categoryItem.GET(empty, missing)).status).toBe(404);
    expect((await categoryItem.PATCH(json({ name: "X" }), missing)).status).toBe(404);
    expect((await categoryItem.DELETE(empty, missing)).status).toBe(404);
  });
});

describe("products", () => {
  const ctx = params({ id: PRODUCT });

  it("creates a product with the default cold-chain flag", async () => {
    const res = await productList.POST(json({ id: PRODUCT, name: "Test Product", categoryId: CATEGORY }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: PRODUCT,
      name: "Test Product",
      categoryId: CATEGORY,
      requiresColdChain: false,
    });
  });

  it("reads, lists and updates a product", async () => {
    expect((await productItem.GET(empty, ctx)).status).toBe(200);

    const list = await (await productList.GET()).json();
    expect(list.map((p: { id: string }) => p.id)).toContain(PRODUCT);

    const updated = await (await productItem.PATCH(json({ requiresColdChain: true }), ctx)).json();
    expect(updated.requiresColdChain).toBe(true);
    expect(updated.name).toBe("Test Product");
  });

  it("rejects an unknown category", async () => {
    const res = await productList.POST(json({ id: "TEST-P2", name: "X", categoryId: "TEST-MISSING" }));
    expect(res.status).toBe(409);
  });

  it("does not delete a category that a product uses", async () => {
    expect((await categoryItem.DELETE(empty, params({ id: CATEGORY }))).status).toBe(409);
  });
});

describe("warehouses", () => {
  const ctx = params({ id: WAREHOUSE });

  it("creates, reads, lists and updates a warehouse", async () => {
    const created = await warehouseList.POST(
      json({ id: WAREHOUSE, city: "Test City", distanceToCustomerKm: 12.5 }),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({
      id: WAREHOUSE,
      city: "Test City",
      distanceToCustomerKm: 12.5,
      hasColdStorage: false,
      hasRefrigeratedFleet: false,
    });

    expect((await warehouseItem.GET(empty, ctx)).status).toBe(200);

    const list = await (await warehouseList.GET()).json();
    expect(list.map((w: { id: string }) => w.id)).toContain(WAREHOUSE);

    const updated = await (await warehouseItem.PATCH(json({ hasColdStorage: true }), ctx)).json();
    expect(updated.hasColdStorage).toBe(true);
  });

  it("rejects a negative distance", async () => {
    const res = await warehouseList.POST(json({ id: "TEST-W2", city: "X", distanceToCustomerKm: -1 }));
    expect(res.status).toBe(400);
  });
});

describe("inventory", () => {
  const ctx = params({ warehouseId: WAREHOUSE, productId: PRODUCT });

  it("creates, reads, lists and updates a stock row", async () => {
    const created = await inventoryList.POST(
      json({ warehouseId: WAREHOUSE, productId: PRODUCT, quantity: 10 }),
    );
    expect(created.status).toBe(201);

    const read = await (await inventoryItem.GET(empty, ctx)).json();
    expect(read).toMatchObject({ warehouseId: WAREHOUSE, productId: PRODUCT, quantity: 10 });

    const list = await (await inventoryList.GET()).json();
    expect(list).toContainEqual(expect.objectContaining({ warehouseId: WAREHOUSE, productId: PRODUCT }));

    const updated = await (await inventoryItem.PATCH(json({ quantity: 25 }), ctx)).json();
    expect(updated.quantity).toBe(25);
  });

  it("rejects invalid quantities, duplicates and unknown references", async () => {
    expect((await inventoryItem.PATCH(json({ quantity: -1 }), ctx)).status).toBe(400);
    expect((await inventoryItem.PATCH(json({ quantity: 1.5 }), ctx)).status).toBe(400);

    const row = { warehouseId: WAREHOUSE, productId: PRODUCT, quantity: 1 };
    expect((await inventoryList.POST(json(row))).status).toBe(409);
    expect((await inventoryList.POST(json({ ...row, warehouseId: "TEST-MISSING" }))).status).toBe(409);
  });

  it("does not delete a product or warehouse that has stock", async () => {
    expect((await productItem.DELETE(empty, params({ id: PRODUCT }))).status).toBe(409);
    expect((await warehouseItem.DELETE(empty, params({ id: WAREHOUSE }))).status).toBe(409);
  });
});

describe("deletes", () => {
  it("deletes the stock row, product, warehouse and category in order", async () => {
    const stock = params({ warehouseId: WAREHOUSE, productId: PRODUCT });
    expect((await inventoryItem.DELETE(empty, stock)).status).toBe(204);
    expect((await inventoryItem.GET(empty, stock)).status).toBe(404);

    expect((await productItem.DELETE(empty, params({ id: PRODUCT }))).status).toBe(204);
    expect((await productItem.GET(empty, params({ id: PRODUCT }))).status).toBe(404);

    expect((await warehouseItem.DELETE(empty, params({ id: WAREHOUSE }))).status).toBe(204);
    expect((await warehouseItem.GET(empty, params({ id: WAREHOUSE }))).status).toBe(404);

    expect((await categoryItem.DELETE(empty, params({ id: CATEGORY }))).status).toBe(204);
    expect((await categoryItem.GET(empty, params({ id: CATEGORY }))).status).toBe(404);
  });
});
