import type { Delivery, Product, Snapshot, Warehouse } from "@/lib/engine";

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

const deliveries: Delivery[] = [
  { warehouseId: "W01", day: "Mon", time: "08:00", durationMinutes: 50 },
  { warehouseId: "W01", day: "Mon", time: "14:00", durationMinutes: 15 },
  { warehouseId: "W01", day: "Tue", time: "07:30", durationMinutes: 55 },
  { warehouseId: "W01", day: "Wed", time: "16:30", durationMinutes: 48 },
  { warehouseId: "W01", day: "Thu", time: "11:00", durationMinutes: 18 },
  { warehouseId: "W01", day: "Fri", time: "17:00", durationMinutes: 65 },
  { warehouseId: "W01", day: "Sat", time: "10:00", durationMinutes: 12 },
  { warehouseId: "W01", day: "Sun", time: "09:00", durationMinutes: 10 },
  { warehouseId: "W02", day: "Mon", time: "08:00", durationMinutes: 70 },
  { warehouseId: "W02", day: "Mon", time: "13:00", durationMinutes: 25 },
  { warehouseId: "W02", day: "Wed", time: "07:45", durationMinutes: 65 },
  { warehouseId: "W02", day: "Thu", time: "18:00", durationMinutes: 80 },
  { warehouseId: "W02", day: "Fri", time: "17:30", durationMinutes: 100 },
  { warehouseId: "W02", day: "Sat", time: "11:00", durationMinutes: 22 },
  { warehouseId: "W02", day: "Sun", time: "10:00", durationMinutes: 20 },
  { warehouseId: "W03", day: "Mon", time: "09:00", durationMinutes: 45 },
  { warehouseId: "W03", day: "Tue", time: "15:00", durationMinutes: 40 },
  { warehouseId: "W03", day: "Thu", time: "07:00", durationMinutes: 60 },
  { warehouseId: "W03", day: "Fri", time: "16:00", durationMinutes: 75 },
  { warehouseId: "W03", day: "Sat", time: "13:00", durationMinutes: 35 },
  { warehouseId: "W04", day: "Mon", time: "10:00", durationMinutes: 50 },
  { warehouseId: "W04", day: "Wed", time: "08:00", durationMinutes: 70 },
  { warehouseId: "W04", day: "Thu", time: "14:00", durationMinutes: 45 },
  { warehouseId: "W04", day: "Fri", time: "17:00", durationMinutes: 85 },
  { warehouseId: "W04", day: "Sun", time: "11:00", durationMinutes: 38 },
  { warehouseId: "W05", day: "Tue", time: "09:00", durationMinutes: 130 },
  { warehouseId: "W05", day: "Thu", time: "10:00", durationMinutes: 125 },
  { warehouseId: "W05", day: "Fri", time: "14:00", durationMinutes: 165 },
  { warehouseId: "W05", day: "Sat", time: "08:00", durationMinutes: 170 },
  { warehouseId: "W05", day: "Sun", time: "16:00", durationMinutes: 190 },
  { warehouseId: "W06", day: "Mon", time: "11:00", durationMinutes: 135 },
  { warehouseId: "W06", day: "Wed", time: "09:00", durationMinutes: 140 },
  { warehouseId: "W06", day: "Fri", time: "15:00", durationMinutes: 180 },
  { warehouseId: "W06", day: "Sun", time: "17:00", durationMinutes: 200 },
  { warehouseId: "W07", day: "Tue", time: "10:00", durationMinutes: 65 },
  { warehouseId: "W07", day: "Thu", time: "15:00", durationMinutes: 70 },
  { warehouseId: "W08", day: "Mon", time: "09:00", durationMinutes: 210 },
  { warehouseId: "W08", day: "Thu", time: "11:00", durationMinutes: 205 },
];

export function sampleSnapshot(): Snapshot {
  return {
    products: new Map(products.map((p) => [p.id, p])),
    warehouses: [...warehouses],
    stock: new Map(
      Object.entries(stock).map(([warehouseId, items]) => [warehouseId, new Map(Object.entries(items))]),
    ),
    deliveries: [...deliveries],
  };
}
