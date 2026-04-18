import * as React from 'react';
import { SharedCalendarDayGridBodyContext } from "./SharedCalendarDayGridBodyContext.js";
import { HTMLProps } from "../../utils/types.js";
import { TemporalSupportedObject } from "../../types/temporal/index.js";
import { CompositeRoot } from "../../composite/root/CompositeRoot.js";
export declare function useSharedCalendarDayGridBody(parameters: UseSharedCalendarDayGridBodyParameters): UseSharedCalendarDayGridBodyReturnValue;
export interface UseSharedCalendarDayGridBodyParameters {
  /**
   * The children of the component.
   * If a function is provided, it will be called for each week to render as its parameter.
   */
  children?: React.ReactNode | ((week: TemporalSupportedObject, index: number, weeks: TemporalSupportedObject[]) => React.ReactNode);
  /**
   * Will render the requested amount of weeks by adding weeks of the next month if needed.
   * Set it to 6 to create a Gregorian calendar where all months have the same number of weeks.
   */
  fixedWeekNumber?: number | undefined;
  /**
   * The offset to apply to the rendered month compared to the current month.
   * This is mostly useful when displaying multiple day grids.
   * @default 0
   */
  offset?: number | undefined;
}
export interface UseSharedCalendarDayGridBodyItemMetadata {
  focusable?: boolean | undefined;
}
export interface UseSharedCalendarDayGridBodyReturnValue {
  /**
   * The props to apply to the element.
   */
  props: HTMLProps;
  /**
   * The props to apply to the composite root.
   */
  compositeRootProps: CompositeRoot.Props<UseSharedCalendarDayGridBodyItemMetadata, any>;
  /**
   * The context to provide to the children of the component.
   */
  context: SharedCalendarDayGridBodyContext;
  /**
   * The ref to apply to the element.
   */
  ref: React.RefObject<HTMLTableSectionElement | null>;
}