export type Product = { id: string; name: string; requiresColdChain: boolean };

export type Warehouse = {
  id: string;
  city: string;
  distanceToCustomerKm: number;
  hasColdStorage: boolean;
  hasRefrigeratedFleet: boolean;
};

export type OrderLine = { productId: string; quantity: number };

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

// When the shipments leave the warehouses. `time` is "HH:MM".
export type Departure = { day: Day; time: string };

export type Order = { items: OrderLine[]; departure?: Departure };

// A past delivery from a warehouse to the customer. `time` is the departure time, "HH:MM".
export type Delivery = { warehouseId: string; day: Day; time: string; durationMinutes: number };

export type Snapshot = {
  products: Map<string, Product>;
  warehouses: Warehouse[];
  // warehouseId -> productId -> quantity. A missing entry means no stock.
  stock: Map<string, Map<string, number>>;
  deliveries: Delivery[];
};

export type ExclusionReason = "NO_STOCK" | "NO_COLD_CHAIN";

export type Exclusion = { warehouseId: string; productId: string; reason: ExclusionReason };

// `approximate` is set when part of the trip has no known distance: a transfer to the hub,
// or a van pickup. `vanFromWarehouseId` is set on a van pickup (see select.ts).
export type Shipment = {
  warehouseId: string;
  distanceKm: number;
  approximate?: true;
  vanFromWarehouseId?: string;
  items: OrderLine[];
};

// Stock moved to the hub of the same city before the hub delivers it to the customer.
export type Transfer = { fromWarehouseId: string; toWarehouseId: string; productId: string; quantity: number };

export type Shortfall = { productId: string; requested: number; available: number };

export type Status = "FULL" | "PARTIAL" | "UNFULFILLABLE";

export type Decision = {
  status: Status;
  shipments: Shipment[];
  transfers: Transfer[];
  unfulfilled: Shortfall[];
  metrics: { shipmentCount: number; totalDistanceKm: number; approximate?: true };
  explanation: string[];
  excluded: Exclusion[];
  warnings: string[];
};

export type OrderErrorCode = "EMPTY_ORDER" | "INVALID_QUANTITY" | "UNKNOWN_PRODUCT";

export class OrderError extends Error {
  constructor(
    readonly code: OrderErrorCode,
    message: string,
    readonly productId?: string,
  ) {
    super(message);
    this.name = "OrderError";
  }
}
