import { z } from "zod";

type PgError = { code?: string; detail?: string };

export function notFound() {
  return Response.json({ error: "Not found" }, { status: 404 });
}

export function errorResponse(err: unknown) {
  if (err instanceof SyntaxError) {
    return Response.json({ error: "Request body is not valid JSON" }, { status: 400 });
  }
  if (err instanceof z.ZodError) {
    return Response.json({ error: "Invalid input", issues: err.issues }, { status: 400 });
  }

  // Drizzle wraps the PostgreSQL error in `cause`.
  const pg = ((err as { cause?: PgError })?.cause ?? err) as PgError;
  if (pg?.code === "23505") {
    return Response.json({ error: "Record already exists", detail: pg.detail }, { status: 409 });
  }
  if (pg?.code === "23503") {
    return Response.json(
      { error: "Related record conflict", detail: pg.detail },
      { status: 409 },
    );
  }

  console.error(err);
  return Response.json({ error: "Unexpected error" }, { status: 500 });
}
