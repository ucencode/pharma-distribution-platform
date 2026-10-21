import type { products, warehouses } from "@/lib/db/schema";
import type { Decision, Status } from "@/lib/engine";
import Badge from "./Badge";
import { muted, table, tableWrap, td, th } from "./styles";

type Product = typeof products.$inferSelect;
type Warehouse = typeof warehouses.$inferSelect;

const statusBadge: Record<Status, { variant: "green" | "amber" | "red"; label: string }> = {
  FULL: { variant: "green", label: "Fully fulfilled" },
  PARTIAL: { variant: "amber", label: "Partially fulfilled" },
  UNFULFILLABLE: { variant: "red", label: "Cannot fulfil" },
};

const card = "rounded border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";
const heading = "text-sm font-semibold text-zinc-900 dark:text-zinc-100";

// Status, shipments, shortfall and explanation of one evaluated order.
export default function ResultCard({
  decision,
  productList,
  warehouseList,
}: {
  decision: Decision;
  productList: Product[];
  warehouseList: Warehouse[];
}) {
  const product = (id: string) => productList.find((p) => p.id === id);
  const city = (id: string) => warehouseList.find((w) => w.id === id)?.city;
  const { variant, label } = statusBadge[decision.status];
  const { shipmentCount, totalDistanceKm } = decision.metrics;

  return (
    <section aria-label="Result" className={`${card} flex flex-col gap-4`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Result</h2>
        <Badge variant={variant}>{label}</Badge>
        <span className={muted}>
          {shipmentCount} {shipmentCount === 1 ? "shipment" : "shipments"}, {totalDistanceKm} km in total
        </span>
      </div>

      {decision.shipments.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {decision.shipments.map((s) => (
            <div key={s.warehouseId} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
              <h3 className={heading}>
                {s.warehouseId} · {city(s.warehouseId)}
              </h3>
              <p className={muted}>{s.distanceKm} km from customer</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-900 dark:text-zinc-100">
                {s.items.map((item) => (
                  <li key={item.productId} className="flex justify-between gap-3">
                    <span>
                      {product(item.productId)?.name ?? item.productId}
                      {product(item.productId)?.requiresColdChain && (
                        <span role="img" aria-label="Cold chain" title="Cold chain" className="ml-1">
                          ❄️
                        </span>
                      )}
                    </span>
                    <span className="font-medium tabular-nums">{item.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {decision.unfulfilled.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className={heading}>Shortfall</h3>
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>Product</th>
                  <th className={`${th} text-right`}>Requested</th>
                  <th className={`${th} text-right`}>Available</th>
                  <th className={`${th} text-right`}>Missing</th>
                </tr>
              </thead>
              <tbody>
                {decision.unfulfilled.map((s) => (
                  <tr key={s.productId}>
                    <td className={td}>{product(s.productId)?.name ?? s.productId}</td>
                    <td className={`${td} text-right tabular-nums`}>{s.requested}</td>
                    <td className={`${td} text-right tabular-nums`}>{s.available}</td>
                    <td className={`${td} text-right font-medium tabular-nums`}>
                      {s.requested - s.available}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className={heading}>Explanation</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-800 dark:text-zinc-200">
          {decision.explanation.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
