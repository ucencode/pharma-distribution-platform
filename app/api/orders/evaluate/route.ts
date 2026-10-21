import { errorResponse } from "@/lib/api";
import { loadSnapshot } from "@/lib/db/queries";
import { evaluate, OrderError } from "@/lib/engine";
import { orderSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const order = orderSchema.parse(await request.json());
    return Response.json(evaluate(order, await loadSnapshot()));
  } catch (err) {
    if (err instanceof OrderError) {
      return Response.json(
        { error: err.message, code: err.code, productId: err.productId },
        { status: err.code === "UNKNOWN_PRODUCT" ? 422 : 400 },
      );
    }
    return errorResponse(err);
  }
}
