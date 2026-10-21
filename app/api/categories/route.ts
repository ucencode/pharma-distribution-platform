import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { errorResponse } from "@/lib/api";
import { categoryCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    return Response.json(await db.select().from(categories).orderBy(asc(categories.id)));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const data = categoryCreateSchema.parse(await request.json());
    const [row] = await db.insert(categories).values(data).returning();
    return Response.json(row, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
