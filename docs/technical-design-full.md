# Technical Design — Warehouse Selection Service

| | |
|---|---|
| **Status** | Draft v0.1 |
| **Date** | 2026-10-17 |
| **Stack** | Next.js (App Router, TypeScript) · PostgreSQL · Drizzle ORM · Vercel + Neon |
| **Scope** | Warehouse selection + simple UI |

---

## 1. Summary

Customers (hospitals, clinics, pharmacies) place orders for one or more products. The service determines which warehouse or warehouses fulfil the order and returns the decision along with the reasoning behind it. The selection weighs stock availability, product handling requirements and delivery distance to determine the most efficient way to fulfil each order.

The system is a single Next.js application backed by PostgreSQL. It serves both the web page and the API.

---

## 2. Requirements

### 2.1 Functional

| ID | Requirement | Priority |
|---|---|---|
| F1 | Accept an order: a list of `{productId, quantity}` lines | Must |
| F2 | Select warehouse(s) based on stock availability and delivery distance | Must |
| F3 | Return the decision with an explanation | Must |
| F4 | Handle orders that no single warehouse can cover (split shipments) | Must |
| F5 | Handle orders that no combination can fully cover (partial result and shortfall) | Must |
| F6 | Provide a UI with an order input form and result display | Must |
| F7 | Enforce product handling requirements (cold chain for vaccines) | Must |
| F8 | Log every evaluation for audit | Could |

### 2.2 Non-functional

- **Availability.** The deployment remains reachable for at least one month. The hosting tier does not pause the project within that period (see §13).
- **Determinism.** Identical input and data produce identical output and explanation.
- **Authentication.** None.
- **Operations.** One repository, one deployment target, managed PostgreSQL.
- **Testability.** The decision logic has no dependency on Next.js or the database.

### 2.3 Out of scope

Stock reservation and decrement, multiple customer locations, user accounts, routing APIs, lot and expiry tracking.

---

## 3. Domain analysis and assumptions

### 3.1 Cold chain

Products P002 (Hepatitis B vaccine) and P004 (Tetanus Toxoid vaccine) require refrigeration from storage until delivery. Warehouse capabilities:

| Warehouse | km | Cold storage | Refrigerated fleet | **Can ship cold chain** |
|---|---|---|---|---|
| W01 Surabaya | 5 | – | – | – |
| W02 Surabaya | 12 | ✅ | – | **No** |
| W03 Sidoarjo | 25 | – | – | – |
| W04 Gresik | 30 | ✅ | ✅ | **Yes** |
| W05 Malang | 90 | – | – | – |
| W06 Malang | 95 | ✅ | – | **No** |
| W07 Pasuruan | 45 | ✅ | ✅ | **Yes** |
| W08 Jember | 150 | ✅ | ✅ | **Yes** |

Cold-chain eligibility is defined as `has_cold_storage AND has_refrigerated_fleet`. W02 and W06 have refrigerated storage but no refrigerated fleet, so their vaccine stock is not eligible for delivery. The explanation reports this whenever W02 or W06 is excluded.

The rule is implemented in a single function, `canShip(product, warehouse)`.

Cold-chain handling is a product attribute (`requires_cold_chain`) and is independent of the product category. Paracetamol is categorised as "Pharmaceutical" but does not require refrigeration.

### 3.2 Other assumptions

| # | Assumption |
|---|---|
| A1 | There is a single customer location. Distance is stored per warehouse as `distance_to_customer_km`. |
| A2 | Evaluating an order produces a quote and does not decrement stock. Reservation is described in §10. |
| A3 | Quantities are positive integers in the product's unit (box or vial). Duplicate lines for the same product are merged. |
| A4 | A shipment is one trip from one warehouse to the customer. All products from the same warehouse travel together. Vehicle capacity is not modelled. |
| A5 | An order is split across warehouses only when no single eligible warehouse can supply it in full. |
| A6 | If an order cannot be fully covered, the response contains the best partial allocation and the shortfall per product. The order is not rejected. |

---

## 4. Technology choices

| Concern | Choice | Rationale | Alternatives considered |
|---|---|---|---|
| App framework | **Next.js (App Router) + TypeScript** | UI and API in one codebase and one deployment. Route Handlers expose a JSON API. Server Components render the product list without client-side fetching. | Express + React SPA: two deployments. NestJS: additional structure not required at this scale. |
| Database | **PostgreSQL** | Relational data (warehouse, product, stock). Constraints (`CHECK quantity >= 0`, foreign keys) enforce data integrity. Transactions and row locks support future stock reservation. | SQLite: serverless hosts have an ephemeral filesystem. MongoDB: no advantage for relational data. |
| ORM / queries | **Drizzle ORM + drizzle-kit** | Typed schemas, SQL-like query API, built-in migrations, low cold-start overhead on serverless. | Prisma: larger client and engine, slower cold starts. Raw SQL: no type safety. |
| DB driver | `postgres` (postgres.js) with Neon's **pooled** connection string | One driver for both local Docker PostgreSQL and Neon. | `@neondatabase/serverless`: requires a different setup for local development. |
| Validation | **Zod** | One schema shared by the API, the form and the types. | – |
| Styling | **Tailwind CSS** (+ optional shadcn/ui primitives) | Utility classes and prebuilt components for the UI. | – |
| Tests | **Vitest** | Native TypeScript support. Engine tests run without a database. | Jest |
| Hosting | **Vercel (Hobby)** + **Neon Postgres (Free)** | Neither free tier pauses the project. Neon suspends compute when idle and resumes in under a second. | Supabase free: pauses projects after about 7 days of inactivity, which conflicts with the one-month availability requirement. Render free: the web service sleeps (30–60 s cold start) and the free database expires. |

> Versions are pinned to the latest stable release at scaffold time (`create-next-app@latest`) and recorded in `package.json`.

---

## 5. Architecture

```
┌──────────────────────────── Next.js app (Vercel) ────────────────────────────┐
│                                                                              │
│  app/page.tsx (Server Component)  ──►  OrderForm (Client Component)          │
│        │ loads products/warehouses           │ POST /api/orders/evaluate     │
│        ▼                                     ▼                               │
│  ┌───────────────────┐        ┌───────────────────────────────────┐          │
│  │ lib/db/queries.ts │◄───────│ app/api/orders/evaluate/route.ts  │          │
│  │ (Drizzle)         │        │  1. zod-validate request          │          │
│  └─────────┬─────────┘        │  2. load snapshot from DB         │          │
│            │                  │  3. call engine (pure function)   │          │
│            │                  │  4. persist evaluation (optional) │          │
│            │                  │  5. return JSON                   │          │
│            │                  └───────────────┬───────────────────┘          │
│            │                                  ▼                              │
│            │                  ┌───────────────────────────────────┐          │
│            │                  │ lib/engine/  (NO framework, NO DB)│          │
│            │                  │  eligibility · selection          │          │
│            │                  │  explain                          │          │
│            │                  └───────────────────────────────────┘          │
└────────────┼─────────────────────────────────────────────────────────────────┘
             ▼
     PostgreSQL (Neon)
```

`lib/engine` accepts a `Snapshot` object (products, warehouses, stock) and an `Order`, and returns a `Decision`. It has no imports from Next.js or Drizzle.

Route handler configuration:

- Route handlers set `export const dynamic = "force-dynamic"` and `runtime = "nodejs"`, so inventory is never served from a static cache.
- Each request loads the full snapshot with three queries. No caching layer is used.

---

## 6. Data model

```sql
-- Prefix followed by n, zero-padded to at least `width` digits.
CREATE FUNCTION padded_id(prefix text, n bigint, width int) RETURNS text ...;

CREATE SEQUENCE categories_id_seq;
CREATE SEQUENCE products_id_seq;
CREATE SEQUENCE warehouses_id_seq;

CREATE TABLE categories (
  id    TEXT PRIMARY KEY DEFAULT padded_id('C', nextval('categories_id_seq'), 2),  -- 'C01'
  name  TEXT NOT NULL UNIQUE                          -- 'Medical Supplies'
);

CREATE TABLE products (
  id                   TEXT PRIMARY KEY DEFAULT padded_id('P', nextval('products_id_seq'), 3),  -- 'P001'
  name                 TEXT NOT NULL,
  category_id          TEXT NOT NULL REFERENCES categories(id),
  requires_cold_chain  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE warehouses (
  id                       TEXT PRIMARY KEY DEFAULT padded_id('W', nextval('warehouses_id_seq'), 2),  -- 'W01'
  city                     TEXT NOT NULL,
  distance_to_customer_km  NUMERIC(7,2) NOT NULL CHECK (distance_to_customer_km >= 0),
  has_cold_storage         BOOLEAN NOT NULL DEFAULT FALSE,
  has_refrigerated_fleet   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE inventory (
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id),
  product_id    TEXT NOT NULL REFERENCES products(id),
  quantity      INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, product_id)
);

-- Optional: audit log of evaluations
CREATE TABLE order_evaluations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  request           JSONB NOT NULL,
  status            TEXT NOT NULL,                    -- FULL | PARTIAL | UNFULFILLABLE
  result            JSONB NOT NULL,
  engine_version    TEXT NOT NULL
);
```

Notes:

- Category, product and warehouse IDs are generated by the database from one sequence per table, in the format of the sample data (`C01`, `P001`, `W01`). Numbers longer than the padding width are kept whole (`P1000`). The API does not accept an ID on create.
- Categories are stored in a table, so new categories are added as rows without a schema migration. The sample data uses two categories: C01 Medical Supplies and C02 Pharmaceutical.
- A missing `inventory` row and a row with `quantity = 0` are treated identically.
- `distance_to_customer_km` is stored on `warehouses` because there is a single customer (A1). Multiple customers require a `warehouse_customer_routes` table or stored coordinates (§10).
- The seed script (`db/seed.ts`) inserts the sample categories, products, warehouses and stock. It is idempotent (`ON CONFLICT DO UPDATE`). It inserts the sample IDs explicitly and then moves each sequence past the highest existing ID, so generated IDs do not collide with them.

---

## 7. Decision engine

### 7.1 Interfaces

```ts
type Order = { items: { productId: string; quantity: number }[] };

type Snapshot = {
  products: Map<string, Product>;
  warehouses: Warehouse[];
  stock: Map<string /* warehouseId */, Map<string /* productId */, number>>;
};

type Decision = {
  status: "FULL" | "PARTIAL" | "UNFULFILLABLE";
  shipments: {
    warehouseId: string;
    distanceKm: number;
    items: { productId: string; quantity: number }[];
  }[];
  unfulfilled: { productId: string; requested: number; available: number }[];
  metrics: { shipmentCount: number; totalDistanceKm: number };
  explanation: string[];
  excluded: { warehouseId: string; productId: string; reason: "NO_STOCK" | "NO_COLD_CHAIN" }[];
};
```

### 7.2 Selection rule

1. **Normalise.** Duplicate product lines are merged. Unknown products and quantities of zero or less are rejected.
2. **Eligibility.** For each product, a warehouse is eligible if it holds the product in stock and, for cold-chain products, has both cold storage and a refrigerated fleet (`canShip`). Each exclusion is recorded with its reason.
3. **Single warehouse.** If one or more eligible warehouses can supply every product in the full quantity, the nearest of them is selected.
4. **Split.** Otherwise, each product is allocated from the nearest eligible warehouse first, then from the next nearest until the quantity is covered. Allocations are grouped by warehouse, one shipment per warehouse.
5. **Shortfall.** Quantity that remains unallocated is reported per product. The status is `FULL` when nothing remains, `PARTIAL` when some quantity remains, and `UNFULFILLABLE` when nothing is allocated.
6. **Explanation.** The explanation is built from the results of steps 2–5 (§7.3).

### 7.3 Explanation generation

Explanations are generated from fixed templates and are deterministic. They are composed in this order:

1. **Outcome:** "Fulfilled from 1 warehouse (W01, 5 km)." or "Split across 2 warehouses because no single warehouse can cover the whole order."
2. **Relevant exclusions:** "W02 (12 km) has Hepatitis B vaccine in refrigerated storage but no refrigerated vehicles, so it cannot deliver cold-chain items."
3. **Allocation:** "Surgical gloves from W01, the nearest warehouse with stock (5 km)."
4. **Shortfall (if any):** "Only 108 of 120 Hepatitis B vials can be shipped. W02/W06 hold 50 more but cannot ship cold-chain."

### 7.4 Worked examples (sample data)

| # | Order | Decision | Rationale |
|---|---|---|---|
| A | Gloves 100, Syringe 100, Paracetamol 50 | **W01** | Nearest warehouse that supplies all items. |
| B | Gloves 100, Hep B 10 | **W01** (gloves) + **W04** (Hep B) | No eligible warehouse supplies both. W02 holds both but has no refrigerated fleet. W04 is the nearest cold-chain warehouse. |
| C | Hep B 10, Tetanus 10 | **W04** | Nearest cold-chain warehouse that supplies both vaccines. |
| D | Hep B 120 | **W04** 40 + **W07** 8 + **W08** 60 → **PARTIAL**, short 12 | Cold-chain eligible stock totals 108 vials. Stock at W02 and W06 is excluded. |

These examples form the core of the engine's unit test suite.

### 7.5 Known limitations

| Order | Decision | Limitation |
|---|---|---|
| Hep B 45, Tetanus 20 | **W08** (150 km) | A single warehouse is preferred even when W04 + W07 (30 km + 45 km) cover the order. |
| Paracetamol 400 | **W05** (90 km) | A single warehouse is preferred even when W01 + W04 (5 km + 30 km) cover the order. |
| Gloves 600 | **W01**, **W02**, **W03**, **W07** | Nearest-first allocation uses four warehouses where W01 + W05 cover the order with two. |

---

## 8. API

### `POST /api/orders/evaluate`

Request:

```json
{
  "items": [
    { "productId": "P001", "quantity": 100 },
    { "productId": "P002", "quantity": 10 }
  ]
}
```

Response `200`:

```json
{
  "status": "FULL",
  "shipments": [
    { "warehouseId": "W01", "distanceKm": 5,  "items": [{ "productId": "P001", "quantity": 100 }] },
    { "warehouseId": "W04", "distanceKm": 30, "items": [{ "productId": "P002", "quantity": 10 }] }
  ],
  "unfulfilled": [],
  "metrics": { "shipmentCount": 2, "totalDistanceKm": 35 },
  "excluded": [
    { "warehouseId": "W02", "productId": "P002", "reason": "NO_COLD_CHAIN" },
    { "warehouseId": "W06", "productId": "P002", "reason": "NO_COLD_CHAIN" }
  ],
  "explanation": [
    "Split across 2 warehouses: no single warehouse can deliver both surgical gloves and Hepatitis B vaccine.",
    "W02 (12 km) stocks both items but has no refrigerated vehicles, so it cannot deliver the vaccine.",
    "Gloves from W01 (closest, 5 km). Vaccine from W04 (closest cold-chain warehouse, 30 km)."
  ]
}
```

Error responses:

| Status | Condition |
|---|---|
| `400` | Validation failure. The body lists Zod issues per field. |
| `422` | Unknown product ID. |
| `500` | Unexpected error. The error is logged, and the body contains no stack trace. |

### Data endpoints

| Resource | Collection | Single record |
|---|---|---|
| Categories | `GET`, `POST /api/categories` | `GET`, `PATCH`, `DELETE /api/categories/:id` |
| Products | `GET`, `POST /api/products` | `GET`, `PATCH`, `DELETE /api/products/:id` |
| Warehouses | `GET`, `POST /api/warehouses` | `GET`, `PATCH`, `DELETE /api/warehouses/:id` |
| Stock | `GET`, `POST /api/inventory` | `GET`, `PATCH`, `DELETE /api/inventory/:warehouseId/:productId` |

`POST` bodies have no `id`; the generated ID is returned in the created record. Invalid input returns `400`, a missing record `404`, and a duplicate category name, a duplicate stock row, an unknown reference or a delete of a record that is still referenced `409`.

`GET /api/evaluations?limit=20` returns recent evaluations (optional, F8).

---

## 9. UI

### Layout

The app uses an admin layout: a top bar across the full width, a sidebar with links to Products, Warehouses and Categories, and a work area that fills the rest of the screen. Below the `md` breakpoint the sidebar is hidden and opens from a Menu button in the top bar. `/` redirects to `/products` until the order page exists.

### Data management pages

Each page is a Server Component that renders one Client Component. The Client Component loads its data from the data endpoints with `fetch` and reloads after every change.

All three pages follow the same pattern:

- A page header with the title and an "Add …" button.
- A table of records. Each row has Edit and Delete buttons.
- Add and Edit open the form in a modal dialog (native `<dialog>`). The edit dialog is titled with the record ID. The forms have no ID field; IDs are generated by the database.
- Delete asks for a second click ("Confirm delete") before the record is deleted.
- A successful save or delete shows a confirmation message above the table. API errors, such as a 409 when deleting a referenced record, are shown in the open dialog or above the table.

| Page | Contents |
|---|---|
| `/categories` | Categories. |
| `/products` | Products. The category dropdown has a "New category…" option that shows a name field for a new category; the category is created first and the product is then saved with it. |
| `/warehouses` | Warehouses. The Stock button on a warehouse row opens that warehouse's stock in a dialog: one line per product it holds, with the quantity. A quantity is changed and saved per line, a product without stock is added with a quantity, and a line is removed with its Remove button. |

### Order page

The order page is the home page (`/`).

1. **Order form.** Repeatable rows with a product dropdown and quantity field, with "Add line" and "Remove" controls.
2. **Result card.**
   - Status badge: Fully fulfilled / Partially fulfilled / Cannot fulfil.
   - One card per shipment: warehouse, city, distance, items, and a ❄️ marker on cold-chain lines.
   - Shortfall table (if any).
   - Explanation as a bulleted list.
3. **Reference panel** (collapsible): warehouse stock matrix with capability icons.

Presets ("Example: vaccine split", "Example: partial order") populate the form with the worked examples.

---

## 10. Future design

| Topic | Approach |
|---|---|
| **Stock reservation** | `POST /api/orders` runs the engine and then, in one transaction, executes `UPDATE inventory SET quantity = quantity − $q WHERE warehouse_id=$w AND product_id=$p AND quantity >= $q` for each line. If any update affects 0 rows, the transaction rolls back and the order is re-evaluated. The conditional update provides concurrency safety without explicit locks. |
| **Multiple customers** | A `customers` table with coordinates, and route distance per (warehouse, customer), optionally cached from a routing API. |
| **Lots and expiry (FEFO)** | An `inventory_lots(batch, expiry_date)` table. Allocation within a warehouse follows first-expiry-first-out, with a minimum remaining shelf life per customer type. |
| **Cold-chain transit limit** | A maximum transit time for cold-chain shipments, applied as a hard constraint. |
| **Stock balancing** | A penalty for reducing a warehouse below its safety-stock threshold. |
| **Cost model** | Distance replaced by actual cost per trip (fuel, refrigerated vehicle premium, driver time). |

---

## 11. Project structure

```
pharma-distribution-platform/
├─ app/
│  ├─ page.tsx                      # redirects to /products; later the order page
│  ├─ categories/page.tsx
│  ├─ products/page.tsx
│  ├─ warehouses/page.tsx
│  ├─ components/
│  │  ├─ api.ts                     # fetch wrapper for the route handlers
│  │  ├─ styles.ts                  # shared Tailwind class strings
│  │  ├─ AdminShell.tsx             # top bar, sidebar, work area
│  │  ├─ Dialog.tsx                 # modal dialog (native <dialog>)
│  │  ├─ CategoriesManager.tsx
│  │  ├─ ProductsManager.tsx
│  │  ├─ WarehousesManager.tsx
│  │  ├─ WarehouseStock.tsx
│  │  ├─ Badge.tsx                  # coloured label (green or red)
│  │  ├─ PageHeader.tsx, Field.tsx, Checkbox.tsx, FormActions.tsx,
│  │  │  RowActions.tsx, Alert.tsx, ListState.tsx   # shared UI parts
│  │  └─ OrderForm, ResultCard      # order page (client)
│  └─ api/
│     ├─ orders/evaluate/route.ts
│     ├─ categories/                # route.ts, [id]/route.ts
│     ├─ products/                  # route.ts, [id]/route.ts
│     ├─ warehouses/                # route.ts, [id]/route.ts
│     ├─ inventory/                 # route.ts, [warehouseId]/[productId]/route.ts
│     └─ evaluations/route.ts
├─ lib/
│  ├─ engine/                       # pure TS: no Next.js, no DB
│  │  ├─ types.ts
│  │  ├─ eligibility.ts
│  │  ├─ select.ts
│  │  ├─ explain.ts
│  │  └─ index.ts                   # evaluate(order, snapshot)
│  ├─ db/
│  │  ├─ schema.ts                  # Drizzle schema
│  │  ├─ client.ts
│  │  └─ queries.ts                 # loadSnapshot(), saveEvaluation()
│  └─ validation.ts                 # Zod schemas
├─ db/
│  ├─ migrations/                   # drizzle-kit output
│  └─ seed.ts
├─ tests/
│  ├─ engine/*.test.ts              # unit: examples A–D + edge cases
│  └─ api/
│     ├─ crud.test.ts               # integration: CRUD endpoints
│     └─ evaluate.test.ts           # integration: order evaluation
├─ docker-compose.yml               # local Postgres
├─ vitest.config.mts
├─ drizzle.config.ts
└─ .env.example                     # DATABASE_URL
```

`TASK.md` (the brief) is git-ignored and is not committed. The README is submitted as an email attachment and is not committed.

---

## 12. Testing strategy

**Engine unit tests (Vitest, no database):**

- Worked examples A–D (§7.4): exact warehouses, allocations and status.
- Cold chain: vaccines are never allocated to W02 or W06. Non-cold-chain products are allocated from them.
- Single-warehouse preference: when several warehouses can supply the whole order, the nearest is selected.
- Split allocation: each product is taken from the nearest eligible warehouse first.
- Partial fulfilment: shortfall calculation, and `UNFULFILLABLE` when no stock is eligible.
- Input validation: duplicate lines merged; zero, negative and non-integer quantities rejected; unknown product; empty order.
- Determinism: shuffled input order produces identical output.

**API integration tests (Vitest, local PostgreSQL):** the tests call the route handlers directly and assert response bodies and status codes. They run against the database in `DATABASE_URL` (read from `.env`) and are started with `npm test`.

- CRUD (`tests/api/crud.test.ts`): create, read, list, update and delete for categories, products, warehouses and stock. Error cases: invalid input, empty update and malformed JSON (`400`), missing record (`404`), duplicate category name or stock row, unknown reference on create or update and delete of a referenced record (`409`). The generated ID format is checked, and an `id` sent on create is ignored. For stock, the tests also check that a quantity of zero is accepted, that an update does not change the warehouse or product of the row, and that an update sets `updated_at`.
- Test records have names starting with `Test`. Their generated IDs are kept during the run and the records are deleted by those IDs afterwards. Seed data is not modified.

**Smoke test:** the UI presets are run against the deployed URL.

---

## 13. Deployment and operations

| Step | Detail |
|---|---|
| Database | Neon project in the nearest region (e.g., `aws-ap-southeast-1`, Singapore), using the pooled connection string. |
| Migration and seed | `pnpm db:migrate && pnpm db:seed`, run against the Neon URL. |
| Application | GitHub repository imported into Vercel, with `DATABASE_URL` set. Function region: Singapore (`sin1`), co-located with the database. |
| CI | GitHub Actions runs `pnpm lint && pnpm typecheck && pnpm test` on every push. Vercel deploys `main`. |
| Cold starts | Vercel Hobby does not sleep. Neon free compute suspends after about 5 minutes idle; the first request after suspension takes about 0.5–1 s. The README documents this. |
| Availability | Neither service pauses or deletes a free project within one month. The deployed URL is checked weekly during the review period. |
| Observability | Vercel function logs. Evaluations are stored in `order_evaluations`. |

---

## 14. Delivery plan

| Phase | Work | Est. |
|---|---|---|
| 1 | Scaffold Next.js + Tailwind + Drizzle, docker-compose Postgres, schema, migration, seed | 0.5 d |
| 2 | Engine: eligibility, selection, explanation + unit tests for examples A–D | 1 d |
| 3 | API route + Zod validation + integration test | 0.5 d |
| 4 | UI: form, result card, stock matrix, presets | 0.5–1 d |
| 5 | Deploy (Neon + Vercel), smoke test | 0.25 d |
| 6 | README (approach, assumptions, AI usage, next steps), final review | 0.5 d |

---

## 15. Open questions

1. **Cold-chain strictness.** Is short-haul vaccine delivery from W02 in insulated containers permitted? Current design: not permitted.
2. **Partial fulfilment policy.** Is a partial order split into an immediate shipment and a backorder, or held for customer confirmation? Current design: available stock is shipped and the shortfall is reported.
