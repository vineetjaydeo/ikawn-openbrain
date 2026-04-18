import { TemporalAdapter, TemporalSupportedObject } from "../../types/temporal/index.js";
export declare function mergeDateAndTime(adapter: TemporalAdapter, dateParam: TemporalSupportedObject, timeParam: TemporalSupportedObject): TemporalSupportedObject;
export declare function areDatesEqual(adapter: TemporalAdapter, a: TemporalSupportedObject | null, b: TemporalSupportedObject | null): boolean;
export declare function replaceInvalidDateByNull(adapter: TemporalAdapter, value: TemporalSupportedObject | null): TemporalSupportedObject | null;
/**
 * Check if the day of the date A is after the day of the date B.
 * Uses timezone of the date A.
 */
export declare function isAfterDay(adapter: TemporalAdapter, dateA: TemporalSupportedObject, dateB: TemporalSupportedObject): boolean;
/**
 * Check if the day of the date A is before the day of the date B.
 * Uses timezone of the date A.
 */
export declare function isBeforeDay(adapter: TemporalAdapter, dateA: TemporalSupportedObject, dateB: TemporalSupportedObject): boolean;
export declare function formatMonthFullLetterAndYear(adapter: TemporalAdapter, date: TemporalSupportedObject): string;