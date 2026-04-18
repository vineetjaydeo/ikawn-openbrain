import { TemporalSupportedObject } from "../../types/temporal/index.js";
import { SharedCalendarDayGridCellContext } from "./SharedCalendarDayGridCellContext.js";
import { HTMLProps } from "../../utils/types.js";
export declare function useSharedCalendarDayGridCell(parameters: UseSharedCalendarDayGridCellParameters): UseSharedCalendarDayGridCellReturnValue;
export interface UseSharedCalendarDayGridCellParameters {
  /**
   * The value to select when this cell is clicked.
   */
  value: TemporalSupportedObject;
}
export interface UseSharedCalendarDayGridCellReturnValue {
  props: HTMLProps;
  /**
   * The context to expose to the children components.
   */
  context: SharedCalendarDayGridCellContext;
}