# Technical Design — Warehouse Selection Service

| | |
|---|---|
| **Status** | Draft v0.1 |
| **Date** | 2026-10-17 |
| **Stack** | Next.js (App Router, TypeScript) · PostgreSQL · Drizzle ORM · Vercel + Neon |
| **Scope** | Warehouse selection + simple UI |

---

## 1. Summary

Hospitals, clinics and pharmacies order one or more products. The service chooses the warehouse or warehouses for each order. It returns the decision and the reasons. The choice uses stock, product handling needs and distance to the customer.

The system is one Next.js application with a PostgreSQL database. It serves the web pages and the API.

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
| F8 | Log every evaluation for audit (not built) | Could |
| F9 | Warn when a shipment leaves at a time at which its warehouse's past deliveries were slow | Could |

### 2.2 Non-functional

- **Availability.** The site stays online for at least one month. The hosting plan does not pause it (§13).
- **Determinism.** The same input and data give the same output and explanation.
- **Authentication.** None.
- **Operations.** One repository, one deployment, one managed PostgreSQL database.
- **Testability.** The decision logic does not depend on Next.js or the database.

### 2.3 Out of scope

Stock reservation, many customer locations, user accounts, routing APIs, batches and expiry dates.

---

## 3. Domain analysis and assumptions

### 3.1 Cold chain

P002 (Hepatitis B vaccine) and P004 (Tetanus Toxoid vaccine) need cold from storage to delivery.

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

Rules:

- A warehouse can ship cold-chain products when it has cold storage and a refrigerated fleet. The function `canShip(product, warehouse)` checks this.
- W02 and W06 have cold storage but no refrigerated fleet. They cannot deliver vaccines themselves. The explanation says this.
- A refrigerated van can collect vaccines at W02 and W06 when other stock is not enough (§7.2 step 6).
- A warehouse without cold storage never supplies vaccines.
- Cold chain is a product field (`requires_cold_chain`), not a category rule. Paracetamol is in "Pharmaceutical", but it does not need cold.

### 3.2 Other assumptions

| # | Assumption |
|---|---|
| A1 | There is one customer location. Each warehouse has one distance, `distance_to_customer_km`. |
| A2 | An evaluation is a quote. It does not reduce stock. §10 describes reservation. |
| A3 | Quantities are positive whole numbers (boxes or vials). Lines for the same product are added together. |
| A4 | A shipment is one trip from one warehouse to the customer. Products from one warehouse travel together. Truck size is not checked. |
| A5 | An order is split only when no single warehouse or city group (§7.2) has all of it. |
| A6 | An order with too little stock is not rejected. The response contains the best partial result and the missing quantity. |
| A7 | The day and time of a past delivery are the departure from the warehouse. The records have no date. |
| A8 | Delivery time warnings check the warehouse that drives to the customer. Transfers inside a city have no records. |
| A9 | Past deliveries only add warnings. They do not change the choice (§7.6). |
| A10 | The current time is Jakarta time (WIB, UTC+7), the customer's time zone. The viewer's time zone is not used. |
| A11 | A van pickup is a fallback. It runs only when a vaccine is still missing after the split. The van comes from the nearest warehouse with a refrigerated fleet. The pickup is a separate trip. |
| A12 | The distance between two warehouses is not known. A pickup trip counts its upper limit: van km + pickup km (empty, through the customer) + pickup km (loaded). |
| A13 | A distance with an unknown part is marked approximate. This covers hub shipments with a transfer (the transfer is not counted) and van pickups (upper limit). |

---

## 4. Technology choices

| Concern | Choice | Rationale | Alternatives considered |
|---|---|---|---|
| App framework | **Next.js (App Router) + TypeScript** | One codebase and one deployment for UI and API. Route Handlers give a JSON API. | Express + React SPA: two deployments. NestJS: more structure than needed. |
| Database | **PostgreSQL** | The data is relational. Constraints (`CHECK quantity >= 0`, foreign keys) protect it. Transactions and row locks support stock reservation later. | SQLite: serverless hosts lose local files. MongoDB: no gain for relational data. |
| ORM / queries | **Drizzle ORM + drizzle-kit** | Typed schemas, SQL-like queries, migrations, fast cold starts. | Prisma: bigger client, slower cold starts. Raw SQL: no types. |
| DB driver | `postgres` (postgres.js) with Neon's **pooled** connection string | One driver for local Docker PostgreSQL and Neon. | `@neondatabase/serverless`: needs a different local setup. |
| Validation | **Zod** | One schema checks each request and gives its TypeScript type. | – |
| Styling | **Tailwind CSS**, lucide-react icons | Utility classes. Shared UI parts live in `app/components/`. | – |
| Tests | **Vitest** | Runs TypeScript directly. Engine tests need no database. | Jest |
| Hosting | **Vercel (Hobby)** + **Neon Postgres (Free)** | Neither free plan pauses the project. Neon sleeps when idle and wakes in under a second. | Supabase free: pauses after about 7 idle days. Render free: the web service sleeps (30–60 s start), and the free database expires. |

> Versions are the latest stable versions at setup time (`create-next-app@latest`). `package.json` records them.

---

## 5. Architecture

```mermaid
flowchart LR
    P["app/page.tsx<br/>Server Component"] --> F["OrderForm<br/>Client Component"]
    F -- "GET /api/products,<br/>/api/warehouses" --> D["Data route handlers"]
    F -- "POST /api/orders/evaluate" --> R["Evaluate route handler<br/>1. validate request (Zod)<br/>2. load snapshot<br/>3. call engine<br/>4. return JSON"]
    R --> Q["lib/db/queries.ts<br/>loadSnapshot()"]
    R --> E["lib/engine<br/>no Next.js, no database"]
    Q --> DB[("PostgreSQL (Neon)")]
    D --> DB
```

`lib/engine` takes a `Snapshot` (products, warehouses, stock, past deliveries) and an `Order`. It returns a `Decision`. It imports nothing from Next.js or Drizzle.

Route handlers:

- Route handlers set no `dynamic` or `runtime` option. Cache Components is on and does not allow them. Handlers run on Node.js. `POST` handlers are never cached.
- Each request loads the full snapshot with one query per table. There is no cache.

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

CREATE TABLE deliveries (
  id                TEXT PRIMARY KEY,                 -- 'DL001'
  warehouse_id      TEXT NOT NULL REFERENCES warehouses(id),
  departure_day     TEXT NOT NULL CHECK (departure_day IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  departure_time    TIME NOT NULL,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0),
  notes             TEXT
);
```

Notes:

- **IDs.** The database makes category, product and warehouse IDs. Each table has one sequence. The format follows the sample data (`C01`, `P001`, `W01`). Longer numbers stay whole (`P1000`). Create requests have no ID.
- **Categories.** Categories are rows in a table. A new category needs no migration. The sample data has C01 Medical Supplies and C02 Pharmaceutical.
- **Stock.** A missing `inventory` row means the same as `quantity = 0`.
- **Distance.** `warehouses` stores the distance, because there is one customer (A1). Many customers need a route table or coordinates (§10).
- **Deliveries.** `deliveries` holds the 38 sample records. The IDs come from the data, so the table has no sequence. No API creates records. Empty notes are `NULL`. The engine does not use notes. A warehouse with delivery records cannot be deleted.
- **Seed.** `db/seed.ts` inserts the sample categories, products, warehouses, stock and deliveries. It can run many times (`ON CONFLICT DO UPDATE`). It inserts fixed IDs, then moves each sequence past the highest ID.

---

## 7. Decision engine

### 7.1 Interfaces

```ts
type Product = { id: string; name: string; requiresColdChain: boolean };

type Warehouse = {
  id: string;
  city: string;
  distanceToCustomerKm: number;
  hasColdStorage: boolean;
  hasRefrigeratedFleet: boolean;
};

type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

type Departure = { day: Day; time: string /* "HH:MM" */ };

type Order = { items: { productId: string; quantity: number }[]; departure?: Departure };

type Delivery = { warehouseId: string; day: Day; time: string /* "HH:MM" */; durationMinutes: number };

type Snapshot = {
  products: Map<string, Product>;
  warehouses: Warehouse[];
  stock: Map<string /* warehouseId */, Map<string /* productId */, number>>;
  deliveries: Delivery[];
};

type Decision = {
  status: "FULL" | "PARTIAL" | "UNFULFILLABLE";
  shipments: {
    warehouseId: string;
    distanceKm: number;
    approximate?: true;            // present when part of the trip has no known distance
    vanFromWarehouseId?: string;   // present on a van pickup
    items: { productId: string; quantity: number }[];
  }[];
  transfers: { fromWarehouseId: string; toWarehouseId: string; productId: string; quantity: number }[];
  unfulfilled: { productId: string; requested: number; available: number }[];
  metrics: { shipmentCount: number; totalDistanceKm: number; approximate?: true };
  explanation: string[];
  excluded: { warehouseId: string; productId: string; reason: "NO_STOCK" | "NO_COLD_CHAIN" }[];
  warnings: string[];
};

class OrderError extends Error {
  code: "EMPTY_ORDER" | "INVALID_QUANTITY" | "UNKNOWN_PRODUCT";
  productId?: string;
}
```

`evaluate(order, snapshot)` returns a `Decision`. It throws an `OrderError` for an invalid order. It does not change the snapshot. `Product` and `Warehouse` use the Drizzle field names, so database rows need no mapping.

### 7.2 Selection rule

"Nearest" means: sorted by `distanceToCustomerKm`, then by ID.

1. **Normalise.** The engine checks each line first. An empty order fails with `EMPTY_ORDER`. An unknown product fails with `UNKNOWN_PRODUCT`. A quantity that is not a positive whole number fails with `INVALID_QUANTITY`. Then lines for the same product are added together and sorted by product ID.
2. **Eligibility.** A warehouse is eligible for a product when it has stock. For a cold-chain product, it also needs cold storage and a refrigerated fleet (`canShip`). Each excluded warehouse gets a reason: `NO_STOCK` or `NO_COLD_CHAIN`.
3. **City groups.** The warehouses of one city form a group. One warehouse, the hub, delivers for the group.
   - The hub is the nearest warehouse in the city. If the order has a cold-chain product, the hub is the nearest warehouse in the city that can ship cold chain, if one exists.
   - A group supplies a product only when its hub can ship that product. So cold-chain products move only between cold-chain warehouses.
   - The group takes stock from the hub first, then from the other warehouses, nearest first. Stock from another warehouse is a transfer to the hub.
   - Groups are sorted by the hub's distance, then by hub ID.
   - Only the hub's distance counts. A hub shipment with a transfer is marked `approximate`.
4. **Single group.** The nearest group with every product in full delivers the whole order. With one warehouse per city, this is the nearest warehouse.
5. **Split.** If no group has everything, each product comes from the nearest group first, then the next one. Each hub makes one shipment. Shipments are sorted by warehouse, items by product ID.
6. **Van pickup.** This step runs when a vaccine is still missing after step 5.
   - The van comes from the nearest warehouse with a refrigerated fleet. Without one, the step is skipped.
   - The van collects at warehouses with cold storage and no refrigerated fleet, nearest first, until the quantity is complete or the stock is used.
   - Each pickup warehouse is one shipment, with `vanFromWarehouseId` and `approximate: true`.
   - `distanceKm` = van distance + 2 × pickup warehouse distance (A12).
   - Pickup shipments come after the other shipments.
7. **Shortfall.** The engine reports the missing quantity per product. `available` is the quantity it can ship. The status is `FULL` (nothing missing), `PARTIAL` (some missing) or `UNFULFILLABLE` (nothing shipped).
8. **Metrics.** `shipmentCount` is the number of shipments. `totalDistanceKm` is the sum of their distances, rounded to two decimals. `approximate` is set when any shipment is approximate.
9. **Explanation.** The engine builds the explanation from steps 2–7 (§7.3).
10. **Delivery time warnings.** If the order has a departure, the engine checks past deliveries (§7.6).

```mermaid
flowchart TD
    A["Order: products and quantities"] --> B{"Valid order?"}
    B -- No --> B1["Rejected: 400 or 422"]
    B -- Yes --> C["Eligibility per product:<br/>in stock, and for cold-chain products<br/>cold storage + refrigerated fleet"]
    C --> D["City groups, each delivering<br/>through one hub"]
    D --> E{"Does one group have<br/>the whole order?"}
    E -- Yes --> F["One shipment from the nearest such group,<br/>with transfers to the hub if needed"]
    E -- No --> G["Split: each product from the nearest<br/>group first, then the next nearest"]
    G --> H{"Vaccine still missing<br/>after the split?"}
    H -- No --> J
    H -- Yes --> I["Van pickup at the nearest<br/>warehouse with cold storage"]
    I --> J
    F --> J["Shortfall and status:<br/>FULL, PARTIAL or UNFULFILLABLE"]
    J --> K["Metrics and explanation"]
    K --> L{"Order in a busy<br/>time window?"}
    L -- Yes --> M["Delivery time warning<br/>if the warehouse is slow then (§7.6)"]
    L -- No --> N["Decision"]
    M --> N
```

Van pickup trip from W04 to W02:

```mermaid
flowchart LR
    V["W04<br/>van, 30 km from customer"] -- "empty: at most 30 + 12 km<br/>(distance W04–W02 not known)" --> P["W02<br/>cold storage, no refrigerated fleet"]
    P -- "loaded: 12 km" --> C(("Customer"))
```

The trip counts as about 30 + 12 + 12 = 54 km.

### 7.3 Explanation generation

The explanation comes from fixed templates. The same decision always gives the same text. The lines come in this order:

| # | Part | Example |
|---|---|---|
| 1 | Outcome, one line | See the table below. |
| 2 | Cold-chain exclusion, one line per warehouse. Only for products that the van does not collect there. `NO_STOCK` is not explained. | "W06 (95 km) has Vaccine — Hepatitis B (10-dose vial) in stock but no refrigerated fleet, so it cannot deliver cold-chain products." |
| 3 | Van pickup, one line per pickup | "W02 (12 km) has no refrigerated fleet, and the other warehouses do not have enough stock. A refrigerated van from W04 (30 km) collects 12 Vaccine — Hepatitis B (10-dose vial) at W02 and delivers them. The trip is about 54 km: at most 30 + 12 km to reach W02, because the distance between W04 and W02 is not known, then 12 km to the customer." |
| 4 | Transit, one line per transfer | "W02 sends 20 Surgical Gloves (Box of 100) to W01, which delivers them with the rest of its shipment. The distance between W02 and W01 is not known and is not counted." |
| 5 | Allocation, one line per product | "Surgical Gloves (Box of 100): 200 from W01 (5 km) and 20 from W02 through W01 (5 km)." / "Vaccine — Hepatitis B (10-dose vial): 40 from W04 (30 km), 8 from W07 (45 km), 60 from W08 (150 km) and 12 from W02 by van from W04 (about 54 km)." |
| 6 | Shortfall, one line per short product. A second sentence names cold-chain-excluded warehouses that still have stock after van pickups. | "Vaccine — Hepatitis B (10-dose vial): 158 of 200 available, 42 missing." / "… W01 has 5 more in stock but cannot deliver cold-chain products." |

Outcome lines:

| Case | Line |
|---|---|
| Single warehouse | "Shipped in full from W01 (5 km), the nearest warehouse with the whole order in stock." |
| Single group with transfers | "Shipped in one delivery from W01 (5 km). The Surabaya warehouses together have the whole order, so they combine their stock at W01." |
| Split | "Split into 2 shipments, because no warehouse can deliver the whole order. Each product comes from the nearest warehouse that has it." |
| Split with one shipment | "Shipped from W04 (30 km). No warehouse can deliver the whole order." |
| Nothing shipped | "Nothing can be shipped: no warehouse that can deliver these products has them in stock." |

### 7.4 Worked examples (sample data)

| # | Order | Decision | Reason |
|---|---|---|---|
| A | Gloves 100, Syringe 100, Paracetamol 50 | **W01** | W01 is the nearest warehouse with all items. |
| B | Gloves 100, Hep B 10 | **W01** (gloves) + **W04** (Hep B) | No eligible warehouse has both. W02 has both, but no refrigerated fleet. W04 is the nearest cold-chain warehouse. |
| C | Hep B 10, Tetanus 10 | **W04** | W04 is the nearest cold-chain warehouse with both vaccines. |
| D | Hep B 120 | **W04** 40 + **W07** 8 + **W08** 60 + **W02** 12 by van from W04 (about 54 km) → **FULL** | The cold-chain warehouses have 108 vials. A van collects the last 12 at W02. |
| E | Gloves 220, Syringe 100 | **W01** (5 km), with 20 gloves moved from W02 to W01 | W01 has 200 gloves, and W02 has 50. Together, the Surabaya group has the whole order. W01 delivers it in one trip. Without city groups, W03 (25 km) would deliver. |

The engine unit tests use these examples.

In the sample data, no city has a cold-chain warehouse. So example E moves only a normal product. A test city in `tests/api/evaluate.test.ts` shows cold-chain transit:

| Warehouse | Distance | Cold storage | Refrigerated fleet | Stock of the test vaccine |
|---|---|---|---|---|
| A | 1 km | ✅ | – | 5 |
| B | 2 km | ✅ | ✅ | 6 |
| C | 3 km | ✅ | ✅ | 4 |

The order is 12 vials:

- B is the hub. It is the nearest cold-chain warehouse in the city.
- C sends 4 vials to B. B delivers 10.
- A is excluded with `NO_COLD_CHAIN`. Its stock does not go to B.
- A van from B collects the last 2 vials at A. The pickup counts as about 4 km (2 + 1 + 1).
- The status is `FULL`.

### 7.5 Known limitations

| Order | Decision | Limitation |
|---|---|---|
| Hep B 45, Tetanus 20 | **W08** (150 km) | The rule prefers one warehouse, even when W04 + W07 (30 km + 45 km) can cover the order. |
| Paracetamol 400 | **W05** (90 km) | The rule prefers one warehouse, even when W01 + W04 (5 km + 30 km) can cover the order. |
| Gloves 600 | **W01** (with W02's 50 moved to W01), **W03**, **W07** | Nearest-first uses three deliveries. W01 + W05 can do it with two. |

### 7.6 Delivery time warnings

The delivery records show two patterns:

- Weekday rush hour is slow for W01–W04, near the customer.
- Fri–Sun is slow for W05 and W06 in Malang.

At other times, the duration follows the distance.

The engine checks two fixed windows. A window includes its start time and excludes its end time.

| Window | Days | Departure times |
|---|---|---|
| Rush hour | Mon–Fri | 07:00–09:00 and 16:00–19:00 |
| Weekend | Fri, Sat, Sun | all day |

`slowWarnings(shipments, deliveries, departure)` in `lib/engine/delivery.ts` runs when the order has a departure. It checks each shipment in order, and each window that contains the departure:

1. It divides the warehouse's records into trips inside the window and trips outside it.
2. Both groups need at least one trip. If the average inside is at least 1.25 × the average outside, it adds a warning.

```mermaid
flowchart TD
    S["Shipment and departure"] --> W{"Departure inside the window?<br/>Rush hour: Mon–Fri 07:00–09:00, 16:00–19:00<br/>Weekend: Fri–Sun"}
    W -- No --> X["No warning for this window"]
    W -- Yes --> T{"The warehouse has trips inside<br/>and outside the window?"}
    T -- No --> X
    T -- Yes --> R{"Average inside at least<br/>1.25 × average outside?"}
    R -- No --> X
    R -- Yes --> Y["Warning with both averages"]
```

Warning template, with averages in whole minutes: "W05 is often slow on Fri–Sun: 175 min on average (3 trips), against 128 min at other times (2 trips)."

Averages per window in the sample records, in minutes. The number of trips is in brackets. A dash means no trips.

| Warehouse | Rush hour | Outside rush hour | Fri–Sun | Mon–Thu | Warning |
|---|---|---|---|---|---|
| W01 | 55 (4) | 14 (4) | 29 (3) | 37 (5) | Rush hour |
| W02 | 79 (4) | 22 (3) | 47 (3) | 60 (4) | Rush hour |
| W03 | 68 (2) | 40 (3) | 55 (2) | 48 (3) | Rush hour |
| W04 | 78 (2) | 44 (3) | 62 (2) | 55 (3) | Rush hour |
| W05 | – | 156 (5) | 175 (3) | 128 (2) | Weekend |
| W06 | – | 164 (4) | 190 (2) | 138 (2) | Weekend |
| W07 | – | 68 (2) | – | 68 (2) | None |
| W08 | – | 208 (2) | – | 208 (2) | None |

The warnings do not change the choice:

- Each warehouse has only two to eight records. Most day and time slots have one record.
- At the same departure time, the nearer warehouse is faster. One exception exists: W02 at Fri 17:30 (100 min) is slower than W04 at Fri 17:00 (85 min). W02 delivers only through a van pickup (§7.2 step 6), because W01 is the Surabaya hub.

---

## 8. API

### `POST /api/orders/evaluate`

Request:

```json
{
  "items": [
    { "productId": "P001", "quantity": 100 },
    { "productId": "P002", "quantity": 10 }
  ],
  "departure": { "day": "Sat", "time": "10:00" }
}
```

`departure` is optional. `day` is `Mon`–`Sun`. `time` is `HH:MM`.

Response `200`:

```json
{
  "status": "FULL",
  "shipments": [
    { "warehouseId": "W01", "distanceKm": 5,  "items": [{ "productId": "P001", "quantity": 100 }] },
    { "warehouseId": "W04", "distanceKm": 30, "items": [{ "productId": "P002", "quantity": 10 }] }
  ],
  "transfers": [],
  "unfulfilled": [],
  "metrics": { "shipmentCount": 2, "totalDistanceKm": 35 },
  "explanation": [
    "Split into 2 shipments, because no warehouse can deliver the whole order. Each product comes from the nearest warehouse that has it.",
    "W02 (12 km) has Vaccine — Hepatitis B (10-dose vial) in stock but no refrigerated fleet, so it cannot deliver cold-chain products.",
    "W06 (95 km) has Vaccine — Hepatitis B (10-dose vial) in stock but no refrigerated fleet, so it cannot deliver cold-chain products.",
    "Surgical Gloves (Box of 100): 100 from W01 (5 km).",
    "Vaccine — Hepatitis B (10-dose vial): 10 from W04 (30 km)."
  ],
  "excluded": [
    { "warehouseId": "W04", "productId": "P001", "reason": "NO_STOCK" },
    { "warehouseId": "W06", "productId": "P001", "reason": "NO_STOCK" },
    { "warehouseId": "W08", "productId": "P001", "reason": "NO_STOCK" },
    { "warehouseId": "W01", "productId": "P002", "reason": "NO_STOCK" },
    { "warehouseId": "W02", "productId": "P002", "reason": "NO_COLD_CHAIN" },
    { "warehouseId": "W03", "productId": "P002", "reason": "NO_STOCK" },
    { "warehouseId": "W05", "productId": "P002", "reason": "NO_STOCK" },
    { "warehouseId": "W06", "productId": "P002", "reason": "NO_COLD_CHAIN" }
  ],
  "warnings": []
}
```

With `"departure": { "day": "Mon", "time": "08:00" }`, the same order has two warnings: one for W01 and one for W04.

`approximate` (on a shipment and on `metrics`) and `vanFromWarehouseId` appear only when they apply. Van pickup from example D:

```json
{ "warehouseId": "W02", "distanceKm": 54, "approximate": true, "vanFromWarehouseId": "W04", "items": [{ "productId": "P002", "quantity": 12 }] }
```

Error responses:

| Status | Condition |
|---|---|
| `400` | Invalid input, including an invalid departure day or time. The body lists the Zod issues per field. |
| `422` | Unknown product ID. |
| `500` | Unexpected error. The server logs it. The body has no stack trace. |

### Data endpoints

| Resource | Collection | Single record |
|---|---|---|
| Categories | `GET`, `POST /api/categories` | `GET`, `PATCH`, `DELETE /api/categories/:id` |
| Products | `GET`, `POST /api/products` | `GET`, `PATCH`, `DELETE /api/products/:id` |
| Warehouses | `GET`, `POST /api/warehouses` | `GET`, `PATCH`, `DELETE /api/warehouses/:id` |
| Stock | `GET`, `POST /api/inventory` | `GET`, `PATCH`, `DELETE /api/inventory/:warehouseId/:productId` |

`POST` bodies have no `id`. The response contains the new ID.

| Status | Condition |
|---|---|
| `400` | Invalid input |
| `404` | Missing record |
| `409` | Duplicate category name, duplicate stock row, unknown reference, or delete of a record that is still in use |

---

## 9. UI

### Layout

The app has an admin layout:

- a top bar across the full width
- a sidebar with links to Order, Categories, Products and Warehouses
- a work area for the rest of the screen

Below the `md` breakpoint, the sidebar is hidden. A Menu button in the top bar opens it.

### Data management pages

Each page is a Server Component with one Client Component. The Client Component loads data from the data endpoints with `fetch`. It reloads after every change.

All three pages work the same way:

- A page header shows the title and an "Add …" button.
- A table shows the records. Each row has Edit and Delete buttons.
- Add and Edit open a form in a dialog (native `<dialog>`). The edit dialog shows the record ID in its title. The forms have no ID field.
- Delete needs a second click ("Confirm delete").
- A save or delete shows a message above the table. API errors, such as `409` on a record in use, show in the dialog or above the table.

| Page | Contents |
|---|---|
| `/categories` | Categories. |
| `/products` | Products. The category dropdown has a "New category…" option. It shows a name field. The app creates the category first, then saves the product. |
| `/warehouses` | Warehouses. The Stock button opens the warehouse's stock in a dialog. Each line shows a product and its quantity. The user changes a quantity, adds a product or removes a line. |

### Order page

The order page is the home page (`/`).

1. **Order form** (`app/components/OrderForm.tsx`).
   - Each row has a product dropdown and a quantity field. "Add line" adds a row. "Remove" deletes a row. The last row cannot be removed.
   - The departure has two options:
     - "Use current time" (default) shows the day and time in Jakarta, for example "Use current time (Thu 9:53 WIB)". It updates every 15 seconds. The browser reads the clock, so the server HTML has no time.
     - "Simulate time" shows a day select (Mon–Sun) and an hour select (00:00–23:00).
   - Every evaluation sends a `departure`: the Jakarta time at submit, or the simulated day and hour.
   - Evaluate sends the order to `POST /api/orders/evaluate`. An API error shows above the form.
2. **Result card** (`app/components/ResultCard.tsx`). It shows below the form after an evaluation. Cities and product names come from the data endpoints.
   - Status badge: Fully fulfilled / Partially fulfilled / Cannot fulfil.
   - One card per shipment: warehouse, city, distance, items, and ❄️ on cold-chain lines.
   - An approximate distance shows as "about 54 km". A van pickup card shows the van ("Refrigerated van from W04"). The total shows "about …" when `metrics.approximate` is set.
   - Delivery time warnings (if any), in an amber box.
   - Shortfall table (if any).
   - Explanation as a list.

---

## 10. Future design

| Topic | Approach |
|---|---|
| **Stock reservation** | `POST /api/orders` runs the engine. Then one transaction runs `UPDATE inventory SET quantity = quantity − $q WHERE warehouse_id=$w AND product_id=$p AND quantity >= $q` for each line. If one update changes 0 rows, the transaction rolls back and the order is evaluated again. The condition in the update makes it safe without locks. |
| **Multiple customers** | A `customers` table with coordinates, and a route distance per warehouse and customer, maybe cached from a routing API. |
| **Lots and expiry (FEFO)** | An `inventory_lots(batch, expiry_date)` table. Each warehouse sends the batch that expires first, with a minimum shelf life per customer type. |
| **Cold-chain transit limit** | A maximum travel time for cold-chain shipments, as a hard rule. |
| **Stock balancing** | A penalty when a warehouse falls below its safety stock. |
| **Cost model** | The real cost per trip (fuel, refrigerated vehicle, driver time) instead of distance. |

---

## 11. Project structure

```
pharma-distribution-platform/
├─ app/
│  ├─ page.tsx                      # order page
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
│  │  ├─ Badge.tsx                  # coloured label
│  │  ├─ PageHeader.tsx, Field.tsx, Checkbox.tsx, FormActions.tsx,
│  │  │  RowActions.tsx, Alert.tsx, ListState.tsx   # shared UI parts
│  │  └─ OrderForm, ResultCard      # order page (client)
│  └─ api/
│     ├─ orders/evaluate/route.ts
│     ├─ categories/                # route.ts, [id]/route.ts
│     ├─ products/                  # route.ts, [id]/route.ts
│     ├─ warehouses/                # route.ts, [id]/route.ts
│     └─ inventory/                 # route.ts, [warehouseId]/[productId]/route.ts
├─ lib/
│  ├─ engine/                       # pure TS: no Next.js, no DB
│  │  ├─ types.ts
│  │  ├─ eligibility.ts
│  │  ├─ select.ts
│  │  ├─ explain.ts
│  │  ├─ delivery.ts                # delivery time warnings
│  │  └─ index.ts                   # evaluate(order, snapshot)
│  ├─ db/
│  │  ├─ schema.ts                  # Drizzle schema
│  │  ├─ client.ts
│  │  └─ queries.ts                 # loadSnapshot()
│  ├─ api.ts                        # errorResponse(), notFound()
│  └─ validation.ts                 # Zod schemas
├─ db/
│  ├─ migrations/                   # drizzle-kit output
│  └─ seed.ts
├─ tests/
│  ├─ engine/
│  │  ├─ evaluate.test.ts           # unit: examples A–D + edge cases
│  │  ├─ delivery.test.ts           # unit: delivery time warnings
│  │  └─ sample.ts                  # sample data as a Snapshot, no database
│  └─ api/
│     ├─ crud.test.ts               # integration: CRUD endpoints
│     └─ evaluate.test.ts           # integration: order evaluation
├─ docker-compose.yml               # local Postgres
├─ vitest.config.mts
├─ drizzle.config.ts
└─ .env.example                     # DATABASE_URL, APP_ENV
```

`TASK.md` (the brief) is git-ignored. The README goes with the email and is not committed.

---

## 12. Testing strategy

### Engine unit tests

Vitest, no database. `tests/engine/sample.ts` builds the sample data as a `Snapshot`.

| Area | Checks |
|---|---|
| `canShip` | Cold-chain products need cold storage and a refrigerated fleet. Other products ship from any warehouse. |
| Examples A–D (§7.4) | Exact shipments, status, shortfall and metrics. B checks the `NO_COLD_CHAIN` exclusions of W02 and W06 and the full explanation. |
| Same-city transit | Example E with its transfer and explanation. Gloves 600 in three deliveries. No cold-chain transfer to or from a warehouse without cold chain. The hub is the city's cold-chain warehouse for a cold-chain order, and the nearest warehouse otherwise. Hub shipments with a transfer are approximate. |
| Van pickup | Example D: 12 vials from W02 by van from W04 (54 km, approximate). Hep B 200: pickups at W02, then W06, and no "more in stock" note. No pickup when the normal rule covers the order. No pickup at a warehouse without cold storage. No pickup for normal products. The van is the nearest warehouse with a refrigerated fleet. Without any refrigerated fleet, nothing ships, and the note names W02 and W06. |
| Validation | Duplicate lines are merged. Empty order, unknown product, and zero, negative or non-whole quantities fail with the right `OrderError` code. Each line is checked before merging. |
| Determinism | Reversed order lines and reversed warehouses give the same output. |
| Delivery time warnings (`delivery.test.ts`) | No warnings without a departure. W05 warns at Fri 14:00, not at Tue 10:00. W01 warns at Mon 08:00, not at Sat 10:00. At Fri 17:00, W01 has only the rush hour warning. Window edges: 07:00 and 18:59 inside, 09:00 and 19:00 outside. A split order is checked per shipment. W08 has no warning. A departure does not change the decision, apart from `warnings`. |

### API integration tests

Vitest with local PostgreSQL. The tests call the route handlers directly and check bodies and status codes. They use the database in `DATABASE_URL` (from `.env`). `npm test` runs them.

| Area | Checks |
|---|---|
| CRUD (`crud.test.ts`) | Create, read, list, update and delete for categories, products, warehouses and stock. `400` for invalid input, an empty update and bad JSON. `404` for a missing record. `409` for a duplicate category name or stock row, an unknown reference, and a delete of a record in use. The ID format is checked. An `id` on create is ignored. Stock: zero is accepted, an update keeps the warehouse and product, and an update sets `updated_at`. |
| Basics (`evaluate.test.ts`) | Example B returns `200` with exact shipments, metrics and W02's `NO_COLD_CHAIN` exclusion. An evaluation does not change stock. An unknown product returns `422`. An empty order, a zero or non-whole quantity and bad JSON return `400`. |
| Not enough stock | A product without stock is `UNFULFILLABLE`. One product with stock and one without is `PARTIAL`. Hep B 120 is `FULL`: 108 from W04, W07 and W08, and 12 from W02 by van from W04. |
| Cold chain | Tetanus ships from W04. W02 and W06 are excluded with `NO_COLD_CHAIN`. Gloves ship from W01 without cold storage. A test product is held by W01 (5, no cold storage) and W02 (15). An order of 20 is `PARTIAL`: a van from W04 collects 15 at W02, and the shortfall line names W01's 5. |
| Same-city transit | Gloves 220 + Syringe 100 is one shipment from W01, with 20 gloves from W02. A cold-chain warehouse added to Surabaya becomes the hub for a cold-chain order, and W01's gloves move to it. The test city (§7.4) shows the cold-chain transfer, the hub choice, and the van pickup at A (about 4 km). |
| Delivery time warnings | Paracetamol 400 at Fri 14:00 ships from W05 with the weekend warning. Gloves 100 at Mon 08:00 has the W01 warning. No departure gives no warnings. A bad day, a bad time and a missing time return `400`. |

Test records have names that start with `Test`. The tests keep their IDs and delete them at the end. Seed data stays the same.

### Smoke test

The worked examples (§7.4) are entered in the UI of the deployed site.

---

## 13. Deployment and operations

| Step | Detail |
|---|---|
| Database | Neon project in the nearest region (for example `aws-ap-southeast-1`, Singapore), with the pooled connection string. |
| Migration and seed | `npm run db:migrate && npm run db:seed`, against the Neon URL. |
| Application | Vercel imports the GitHub repository. `DATABASE_URL` is the pooled connection string, and `APP_ENV=production`. The function region is Singapore (`sin1`), next to the database. |
| Environments | `APP_ENV` is `development` (local, in `.env`) or `production` (Vercel). Production turns off prepared statements, because Neon's pooled connection does not support them. |
| CI | No CI is set up. Lint, type check and tests run locally. Vercel deploys `main`. |
| Cold starts | Vercel Hobby does not sleep. Neon free compute sleeps after about 5 idle minutes. The first request after that takes about 0.5–1 s. The README says this. |
| Availability | Neither service pauses or deletes a free project within one month. The site is checked every week during the review. |
| Observability | Vercel function logs. |

---

## 14. Delivery plan

| Phase | Work | Est. |
|---|---|---|
| 1 | Scaffold Next.js + Tailwind + Drizzle, docker-compose Postgres, schema, migration, seed | 0.5 d |
| 2 | Engine: eligibility, selection, explanation + unit tests for examples A–D | 1 d |
| 3 | API route + Zod validation + integration test | 0.5 d |
| 4 | UI: form, result card | 0.5–1 d |
| 5 | Deploy (Neon + Vercel), smoke test | 0.25 d |
| 6 | README (approach, assumptions, AI usage, next steps), final review | 0.5 d |

---

## 15. Open questions

1. **Cold-chain strictness.** Can W02 send vaccines over short trips in insulated boxes? Current design: no.
2. **Partial orders.** Does a partial order ship now with a backorder, or wait for the customer? Current design: the app ships what it can and reports what is missing.
