import { TemporalSupportedObject, TemporalAdapter } from "../../types/temporal/index.js";
/**
 * Computes a flat, chronologically ordered array of all days in a month's grid.
 * Composes `getWeekList` and `getDayList` to produce the same result as the rendered grid.
 */
export declare function computeMonthDayGrid(adapter: TemporalAdapter, month: TemporalSupportedObject, fixedWeekNumber?: number, weeks?: TemporalSupportedObject[]): TemporalSupportedObject[];