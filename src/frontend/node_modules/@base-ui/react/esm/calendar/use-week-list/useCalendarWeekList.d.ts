import { TemporalSupportedObject } from "../../types/temporal/temporal.js";
export declare function useCalendarWeekList(): UseWeekListReturnValue;
export type UseWeekListReturnValue = (parameters: UseWeekListReturnValueParameters) => TemporalSupportedObject[];
interface UseWeekListReturnValueParameters {
  /**
   * The date to get the weeks in month for.
   */
  date: TemporalSupportedObject;
  /**
   * The amount of weeks to return.
   * When equal to "end-of-month", the method will return all the weeks until the end of the month.
   * When equal to a number, the method will return that many weeks.
   * Set it to 6 to create a Gregorian calendar where all months have the same number of weeks.
   */
  amount: number | 'end-of-month';
}
export {};