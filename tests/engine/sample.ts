import type { Product, Snapshot, Warehouse } from "@/lib/engine";

// The sample data from db/seed.ts, built by hand so the engine tests need no database.
const products: Product[] = [
  { id: "P001", name: "Surgical Gloves (Box of 100)", requiresColdChain: false },
  { id: "P002", name: "Vaccine — Hepatitis B (10-dose vial)", requiresColdChain: true },
  { id: "P003", name: "Disposable Syringe (Box of 50)", requiresColdChain: false },
  { id: "P004", name: "Vaccine — Tetanus Toxoid (10-dose vial)", requiresColdChain: true },
  { id: "P005", name: "Paracetamol Tablets (Box of 100)", requiresColdChain: false },
];

const warehouses: Warehouse[] = [
  { id: "W01", city: "Surabaya", distanceToCustomerKm: 5, hasColdStorage: false, hasRefrigeratedFleet: false },
  { id: "W02", city: "Surabaya", distanceToCustomerKm: 12, hasColdStorage: true, hasRefrigeratedFleet: false },
  { id: "W03", city: "Sidoarjo", distanceToCustomerKm: 25, hasColdStorage: false, hasRefrigeratedFleet: false },
  { id: "W04", city: "Gresik", distanceToCustomerKm: 30, hasColdStorage: true, hasRefrigeratedFleet: true },
  { id: "W05", city: "Malang", distanceToCustomerKm: 90, hasColdStorage: false, hasRefrigeratedFleet: false },
  { id: "W06", city: "Malang", distanceToCustomerKm: 95, hasColdStorage: true, hasRefrigeratedFleet: false },
  { id: "W07", city: "Pasuruan", distanceToCustomerKm: 45, hasColdStorage: true, hasRefrigeratedFleet: true },
  { id: "W08", city: "Jember", distanceToCustomerKm: 150, hasColdStorage: true, hasRefrigeratedFleet: true },
];

const stock: Record<string, Record<string, number>> = {
  W01: { P001: 200, P003: 500, P005: 300 },
  W02: { P001: 50, P002: 30, P004: 20 },
  W03: { P001: 300, P003: 200 },
  W04: { P002: 40, P004: 25, P005: 100 },
  W05: { P001: 400, P003: 300, P005: 500 },
  W06: { P002: 20, P004: 30, P003: 100 },
  W07: { P002: 8, P004: 10, P001: 150 },
  W08: { P002: 60, P004: 50, P005: 200 },
};

export function sampleSnapshot(): Snapshot {
  return {
    products: new Map(products.map((p) => [p.id, p])),
    warehouses: [...warehouses],
    stock: new Map(
      Object.entries(stock).map(([warehouseId, items]) => [warehouseId, new Map(Object.entries(items))]),
    ),
  };
}
