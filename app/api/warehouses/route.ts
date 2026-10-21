import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { warehouses } from "@/lib/db/schema";
import { errorResponse } from "@/lib/api";
import { warehouseCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    return Response.json(await db.select().from(warehouses).orderBy(asc(warehouses.id)));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const data = warehouseCreateSchema.parse(await request.json());
    const [row] = await db.insert(warehouses).values(data).returning();
    return Response.json(row, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
