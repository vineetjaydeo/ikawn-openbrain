import { TemporalAdapter, TemporalSupportedObject } from "../../types/temporal/index.js";
/**
 * Computes a list of consecutive days starting from the given date.
 * This is a pure function — no React hooks required.
 */
export declare function getDayList(adapter: TemporalAdapter, params: {
  date: TemporalSupportedObject;
  amount: number;
}): TemporalSupportedObject[];