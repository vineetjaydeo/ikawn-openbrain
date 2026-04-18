import { TemporalSupportedObject } from "../../types/temporal/index.js";
export declare function useCalendarDayList(): UseCalendarDayListReturnValue;
export type UseCalendarDayListReturnValue = (parameters: {
  /**
   * The date to get the weeks in month for.
   */
  date: TemporalSupportedObject;
  /**
   * The amount of days to return.
   */
  amount: number;
}) => TemporalSupportedObject[];