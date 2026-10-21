import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { errorResponse } from "@/lib/api";
import { productCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    return Response.json(await db.select().from(products).orderBy(asc(products.id)));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const data = productCreateSchema.parse(await request.json());
    const [row] = await db.insert(products).values(data).returning();
    return Response.json(row, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
