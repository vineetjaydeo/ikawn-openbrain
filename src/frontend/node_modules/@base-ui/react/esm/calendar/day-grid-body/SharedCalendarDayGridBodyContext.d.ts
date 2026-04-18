import * as React from 'react';
import { TemporalSupportedObject } from "../../types/temporal/index.js";
export interface SharedCalendarDayGridBodyContext {
  /**
   * The month of this component.
   */
  month: TemporalSupportedObject;
  /**
   * Today's date, computed once at the grid body level.
   */
  today: TemporalSupportedObject;
}
export declare const SharedCalendarDayGridBodyContext: React.Context<SharedCalendarDayGridBodyContext | undefined>;
export declare function useSharedCalendarDayGridBodyContext(): SharedCalendarDayGridBodyContext;