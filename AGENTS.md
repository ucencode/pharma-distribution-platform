<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project context

Backend and simple UI for a pharmaceutical distribution platform. Given an order (products and quantities), the system selects the warehouse or warehouses that fulfil it and returns the decision with an explanation. There is a single customer location, so each warehouse has one fixed distance to the customer.

The design is in `docs/technical-design-full.md`.

## Working rules

- Keep the implementation simple. Add only what the current task needs: no extra layers, abstractions, config options or features.
- Work on the part the user names and stop there.
- Update `docs/technical-design-full.md` when a change affects the data model, API, project structure or tests.
- Commit messages use a type prefix (`feat:`, `fix:`, `chore:`, `test:`, `docs:`) and have no co-author line.
- `TASK.md`, `TODO.md`, `README.md` must never be committed.

## Stack

Next.js 16 (App Router, TypeScript), Tailwind CSS 4, PostgreSQL 17 in Docker for local development, Drizzle ORM with postgres.js, Zod 4 and Vitest. The package manager is npm; the design document mentions pnpm in places, but pnpm is not used.

## Commands

```sh
docker compose up -d     # start local PostgreSQL on port 5432
cp .env.example .env     # DATABASE_URL for local development
npm run db:migrate       # apply migrations
npm run db:seed          # insert or update the sample data (safe to run repeatedly)
npm run dev              # start the app on http://localhost:3000
npm test                 # run the integration tests (needs the database)
npm run lint
npx next typegen && npx tsc --noEmit   # type check (typegen creates the RouteContext types)
```

After changing `lib/db/schema.ts`, run `npm run db:generate` to create a new migration in `db/migrations/`. Migrations are committed, so existing ones are not edited or regenerated.

## Layout

| Path | Contents |
|---|---|
| `lib/db/schema.ts` | Drizzle schema: `categories`, `products`, `warehouses`, `inventory` |
| `lib/db/client.ts` | Database client (`db`) and `closeDb()` |
| `lib/validation.ts` | Zod schemas for create and update requests |
| `lib/api.ts` | `errorResponse()` and `notFound()` used by every route handler |
| `app/api/<resource>/route.ts` | `GET` (list) and `POST` (create) |
| `app/api/<resource>/[id]/route.ts` | `GET`, `PATCH` and `DELETE` for one record |
| `app/api/inventory/[warehouseId]/[productId]/route.ts` | Same for one stock row, keyed by warehouse and product |
| `db/seed.ts` | Sample data from the brief |
| `tests/api/crud.test.ts` | Integration tests for the endpoints |

## Data model

- `categories`: `id` (text, e.g. `C01`), `name` (unique).
- `products`: `id` (text, e.g. `P001`), `name`, `category_id` referencing `categories`, `requires_cold_chain`.
- `warehouses`: `id` (text, e.g. `W01`), `city`, `distance_to_customer_km`, `has_cold_storage`, `has_refrigerated_fleet`.
- `inventory`: one row per warehouse and product, with `quantity` (non-negative integer) and `updated_at`.

Foreign keys have no cascade. A category, product or warehouse that is still referenced cannot be deleted.

## Conventions

- Route handlers follow the same pattern: parse the body with a Zod schema, run one Drizzle query, return `Response.json(...)`, and pass any error to `errorResponse()`. New endpoints copy this pattern.
- Status codes: `201` on create, `204` on delete, `400` for invalid input or malformed JSON, `404` for a missing record, `409` for a duplicate ID or a foreign-key conflict (the PostgreSQL detail message is returned in `detail`).
- Update schemas are the create schema without `id`, made partial, and reject an empty body. Zod schemas do not set defaults; column defaults come from the database. A default inside a partial schema would overwrite stored values on `PATCH`.
- Drizzle wraps PostgreSQL errors; the error code is read from `err.cause`.
- Route `params` is a promise and is typed with `RouteContext<"/api/...">`.
- `distance_to_customer_km` is `NUMERIC` read in number mode, so the API returns it as a number.

## Tests

The integration tests call the route handlers directly as functions and run against the database in `DATABASE_URL`, which `vitest.config.mts` reads from `.env`. Test records use IDs starting with `TEST-` and are deleted after the run; seed data is not modified. New tests follow the same rule.
