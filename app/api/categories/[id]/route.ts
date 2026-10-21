import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { errorResponse, notFound } from "@/lib/api";
import { categoryUpdateSchema } from "@/lib/validation";

export async function GET(_request: Request, ctx: RouteContext<"/api/categories/[id]">) {
  try {
    const { id } = await ctx.params;
    const [row] = await db.select().from(categories).where(eq(categories.id, id));
    return row ? Response.json(row) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/categories/[id]">) {
  try {
    const { id } = await ctx.params;
    const data = categoryUpdateSchema.parse(await request.json());
    const [row] = await db.update(categories).set(data).where(eq(categories.id, id)).returning();
    return row ? Response.json(row) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/categories/[id]">) {
  try {
    const { id } = await ctx.params;
    const [row] = await db.delete(categories).where(eq(categories.id, id)).returning();
    return row ? new Response(null, { status: 204 }) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}
