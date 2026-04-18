import * as React from 'react';
import { BaseUIComponentProps, NativeButtonProps } from "../../utils/types.js";
/**
 * Displays an element to navigate to the next month in the calendar.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare const CalendarIncrementMonth: React.ForwardRefExoticComponent<Omit<CalendarIncrementMonthProps, "ref"> & React.RefAttributes<HTMLButtonElement>>;
export interface CalendarIncrementMonthState {
  /**
   * Whether the button is disabled.
   */
  disabled: boolean;
}
export interface CalendarIncrementMonthProps extends BaseUIComponentProps<'button', CalendarIncrementMonthState>, NativeButtonProps {}
export declare namespace CalendarIncrementMonth {
  type State = CalendarIncrementMonthState;
  type Props = CalendarIncrementMonthProps;
}