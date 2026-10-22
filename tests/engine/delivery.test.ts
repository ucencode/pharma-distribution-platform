import { describe, expect, it } from "vitest";
import { evaluate, type Day, type Order } from "@/lib/engine";
import { sampleSnapshot } from "./sample";

const order = (items: [string, number][], day?: Day, time?: string): Order => ({
  items: items.map(([productId, quantity]) => ({ productId, quantity })),
  departure: day && time ? { day, time } : undefined,
});

const gloves: [string, number][] = [["P001", 100]];
const paracetamol: [string, number][] = [["P005", 400]];

const w01RushHour =
  "W01 is often slow in weekday rush hour (Mon–Fri, 07:00–09:00 and 16:00–19:00): 55 min on average (4 trips), against 14 min at other times (4 trips).";
const w05Weekend =
  "W05 is often slow on Fri–Sun: 175 min on average (3 trips), against 128 min at other times (2 trips).";

describe("delivery time warnings", () => {
  it("gives no warnings without a departure", () => {
    expect(evaluate(order(paracetamol), sampleSnapshot()).warnings).toEqual([]);
  });

  it("warns that W05 is slow on Fri–Sun", () => {
    const decision = evaluate(order(paracetamol, "Fri", "14:00"), sampleSnapshot());

    expect(decision.shipments.map((s) => s.warehouseId)).toEqual(["W05"]);
    expect(decision.warnings).toEqual([w05Weekend]);
  });

  it("gives no W05 warning on a weekday", () => {
    expect(evaluate(order(paracetamol, "Tue", "10:00"), sampleSnapshot()).warnings).toEqual([]);
  });

  it("warns that W01 is slow in weekday rush hour", () => {
    expect(evaluate(order(gloves, "Mon", "08:00"), sampleSnapshot()).warnings).toEqual([w01RushHour]);
  });

  it("gives no W01 warning on a weekend, which is not slow for W01", () => {
    expect(evaluate(order(gloves, "Sat", "10:00"), sampleSnapshot()).warnings).toEqual([]);
  });

  it("gives only the rush hour warning for W01 on Friday evening", () => {
    expect(evaluate(order(gloves, "Fri", "17:00"), sampleSnapshot()).warnings).toEqual([w01RushHour]);
  });

  it("includes the start and excludes the end of a rush hour window", () => {
    const warnings = (time: string) => evaluate(order(gloves, "Mon", time), sampleSnapshot()).warnings;

    expect(warnings("07:00")).toEqual([w01RushHour]);
    expect(warnings("08:59")).toEqual([w01RushHour]);
    expect(warnings("09:00")).toEqual([]);
    expect(warnings("18:59")).toEqual([w01RushHour]);
    expect(warnings("19:00")).toEqual([]);
  });

  it("checks every shipment, in shipment order", () => {
    const decision = evaluate(order([["P001", 100], ["P002", 10]], "Mon", "08:00"), sampleSnapshot());

    expect(decision.shipments.map((s) => s.warehouseId)).toEqual(["W01", "W04"]);
    expect(decision.warnings).toEqual([
      w01RushHour,
      "W04 is often slow in weekday rush hour (Mon–Fri, 07:00–09:00 and 16:00–19:00): 78 min on average (2 trips), against 44 min at other times (3 trips).",
    ]);
  });

  it("gives no warning for a warehouse without trips in the window", () => {
    // W08 has two trips, both outside the windows.
    expect(evaluate(order([["P002", 45], ["P004", 20]], "Sat", "10:00"), sampleSnapshot()).warnings).toEqual([]);
  });

  it("does not change the decision", () => {
    const without = evaluate(order(paracetamol), sampleSnapshot());
    const withDeparture = evaluate(order(paracetamol, "Fri", "14:00"), sampleSnapshot());

    expect({ ...withDeparture, warnings: [] }).toEqual(without);
  });
});
