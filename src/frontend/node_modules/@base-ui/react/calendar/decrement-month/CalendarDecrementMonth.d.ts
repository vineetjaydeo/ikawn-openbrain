import * as React from 'react';
import { BaseUIComponentProps, NativeButtonProps } from "../../utils/types.js";
/**
 * Displays an element to navigate to the previous month in the calendar.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare const CalendarDecrementMonth: React.ForwardRefExoticComponent<Omit<CalendarDecrementMonthProps, "ref"> & React.RefAttributes<HTMLButtonElement>>;
export interface CalendarDecrementMonthState {
  /**
   * Whether the button is disabled.
   */
  disabled: boolean;
}
export interface CalendarDecrementMonthProps extends BaseUIComponentProps<'button', CalendarDecrementMonthState>, NativeButtonProps {}
export declare namespace CalendarDecrementMonth {
  type State = CalendarDecrementMonthState;
  type Props = CalendarDecrementMonthProps;
}