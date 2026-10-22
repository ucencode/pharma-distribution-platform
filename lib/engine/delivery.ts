import type { Day, Delivery, Departure, Shipment } from "./types";

export const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// A trip in a window is slow when the window's average duration is at least this many
// times the average of the warehouse's other trips.
const SLOW_RATIO = 1.25;

type Window = {
  label: string;
  days: Day[];
  // Departure times as [start, end): start included, end not included. Empty means all day.
  times: [string, string][];
};

const WINDOWS: Window[] = [
  {
    label: "in weekday rush hour (Mon–Fri, 07:00–09:00 and 16:00–19:00)",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    times: [
      ["07:00", "09:00"],
      ["16:00", "19:00"],
    ],
  },
  { label: "on Fri–Sun", days: ["Fri", "Sat", "Sun"], times: [] },
];

// "HH:MM" strings compare in time order.
const inWindow = (window: Window, day: Day, time: string) =>
  window.days.includes(day) &&
  (window.times.length === 0 || window.times.some(([start, end]) => start <= time && time < end));

const average = (trips: Delivery[]) => trips.reduce((sum, t) => sum + t.durationMinutes, 0) / trips.length;

const trips = (n: number) => `${n} ${n === 1 ? "trip" : "trips"}`;

// Warns when a shipment leaves in a window in which its warehouse's past trips were slow.
// The warnings do not change the decision. Shipments are checked in their order.
export function slowWarnings(shipments: Shipment[], deliveries: Delivery[], departure: Departure): string[] {
  const warnings: string[] = [];
  for (const { warehouseId } of shipments) {
    const history = deliveries.filter((d) => d.warehouseId === warehouseId);
    for (const window of WINDOWS) {
      if (!inWindow(window, departure.day, departure.time)) continue;
      const inside = history.filter((d) => inWindow(window, d.day, d.time));
      const outside = history.filter((d) => !inWindow(window, d.day, d.time));
      if (inside.length === 0 || outside.length === 0) continue;
      if (average(inside) < SLOW_RATIO * average(outside)) continue;
      warnings.push(
        `${warehouseId} is often slow ${window.label}: ${Math.round(average(inside))} min on average (${trips(inside.length)}), against ${Math.round(average(outside))} min at other times (${trips(outside.length)}).`,
      );
    }
  }
  return warnings;
}
