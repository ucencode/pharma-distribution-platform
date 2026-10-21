import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { inventory } from "@/lib/db/schema";
import { errorResponse, notFound } from "@/lib/api";
import { inventoryUpdateSchema } from "@/lib/validation";

type Ctx = RouteContext<"/api/inventory/[warehouseId]/[productId]">;

const byKey = (warehouseId: string, productId: string) =>
  and(eq(inventory.warehouseId, warehouseId), eq(inventory.productId, productId));

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { warehouseId, productId } = await ctx.params;
    const [row] = await db.select().from(inventory).where(byKey(warehouseId, productId));
    return row ? Response.json(row) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { warehouseId, productId } = await ctx.params;
    const data = inventoryUpdateSchema.parse(await request.json());
    const [row] = await db
      .update(inventory)
      .set({ ...data, updatedAt: sql`now()` })
      .where(byKey(warehouseId, productId))
      .returning();
    return row ? Response.json(row) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { warehouseId, productId } = await ctx.params;
    const [row] = await db.delete(inventory).where(byKey(warehouseId, productId)).returning();
    return row ? new Response(null, { status: 204 }) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}
