import * as React from 'react';
import { TemporalSupportedObject } from "../../types/temporal/index.js";
export interface SharedCalendarDayGridCellContext {
  /**
   * The value to select when this cell is clicked.
   */
  value: TemporalSupportedObject;
  /**
   * Whether the cell is disabled.
   */
  isDisabled: boolean;
  /**
   * Whether the cell is unavailable.
   */
  isUnavailable: boolean;
  /**
   * Whether the cell is outside the current month.
   */
  isOutsideCurrentMonth: boolean;
}
export declare const SharedCalendarDayGridCellContext: React.Context<SharedCalendarDayGridCellContext | undefined>;
export declare function useCalendarDayGridCellContext(): SharedCalendarDayGridCellContext;