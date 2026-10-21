import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { errorResponse, notFound } from "@/lib/api";
import { productUpdateSchema } from "@/lib/validation";

export async function GET(_request: Request, ctx: RouteContext<"/api/products/[id]">) {
  try {
    const { id } = await ctx.params;
    const [row] = await db.select().from(products).where(eq(products.id, id));
    return row ? Response.json(row) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/products/[id]">) {
  try {
    const { id } = await ctx.params;
    const data = productUpdateSchema.parse(await request.json());
    const [row] = await db.update(products).set(data).where(eq(products.id, id)).returning();
    return row ? Response.json(row) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/products/[id]">) {
  try {
    const { id } = await ctx.params;
    const [row] = await db.delete(products).where(eq(products.id, id)).returning();
    return row ? new Response(null, { status: 204 }) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}
