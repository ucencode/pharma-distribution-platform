import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { warehouses } from "@/lib/db/schema";
import { errorResponse, notFound } from "@/lib/api";
import { warehouseUpdateSchema } from "@/lib/validation";

export async function GET(_request: Request, ctx: RouteContext<"/api/warehouses/[id]">) {
  try {
    const { id } = await ctx.params;
    const [row] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    return row ? Response.json(row) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/warehouses/[id]">) {
  try {
    const { id } = await ctx.params;
    const data = warehouseUpdateSchema.parse(await request.json());
    const [row] = await db.update(warehouses).set(data).where(eq(warehouses.id, id)).returning();
    return row ? Response.json(row) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/warehouses/[id]">) {
  try {
    const { id } = await ctx.params;
    const [row] = await db.delete(warehouses).where(eq(warehouses.id, id)).returning();
    return row ? new Response(null, { status: 204 }) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}
