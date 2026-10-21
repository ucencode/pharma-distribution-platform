import type { Metadata } from "next";
import WarehousesManager from "../components/WarehousesManager";

export const metadata: Metadata = { title: "Warehouses" };

export default function WarehousesPage() {
  return <WarehousesManager />;
}
