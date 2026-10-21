export type Product = { id: string; name: string; requiresColdChain: boolean };

export type Warehouse = {
  id: string;
  city: string;
  distanceToCustomerKm: number;
  hasColdStorage: boolean;
  hasRefrigeratedFleet: boolean;
};

export type OrderLine = { productId: string; quantity: number };

export type Order = { items: OrderLine[] };

export type Snapshot = {
  products: Map<string, Product>;
  warehouses: Warehouse[];
  // warehouseId -> productId -> quantity. A missing entry means no stock.
  stock: Map<string, Map<string, number>>;
};

export type ExclusionReason = "NO_STOCK" | "NO_COLD_CHAIN";

export type Exclusion = { warehouseId: string; productId: string; reason: ExclusionReason };

export type Shipment = { warehouseId: string; distanceKm: number; items: OrderLine[] };

export type Shortfall = { productId: string; requested: number; available: number };

export type Status = "FULL" | "PARTIAL" | "UNFULFILLABLE";

export type Decision = {
  status: Status;
  shipments: Shipment[];
  unfulfilled: Shortfall[];
  metrics: { shipmentCount: number; totalDistanceKm: number };
  explanation: string[];
  excluded: Exclusion[];
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
