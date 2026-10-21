import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { inventory } from "@/lib/db/schema";
import { errorResponse } from "@/lib/api";
import { inventoryCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    return Response.json(
      await db
        .select()
        .from(inventory)
        .orderBy(asc(inventory.warehouseId), asc(inventory.productId)),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const data = inventoryCreateSchema.parse(await request.json());
    const [row] = await db.insert(inventory).values(data).returning();
    return Response.json(row, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
