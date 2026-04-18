import { TemporalSupportedObject, TemporalAdapter } from "../../types/temporal/index.js";
/**
 * Computes a list of week-start dates for the given month/date.
 * This is a pure function — no React hooks required.
 */
export declare function getWeekList(adapter: TemporalAdapter, params: {
  date: TemporalSupportedObject;
  amount: number | 'end-of-month';
}): TemporalSupportedObject[];