import * as React from 'react';
import { BaseUIComponentProps, NativeButtonProps } from "../../utils/types.js";
/**
 * An individual interactive day button in the calendar.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare const CalendarDayButton: React.NamedExoticComponent<Omit<CalendarDayButtonProps, "ref"> & React.RefAttributes<HTMLButtonElement>>;
export interface CalendarDayButtonState {
  /**
   * Whether the day is selected.
   */
  selected: boolean;
  /**
   * Whether the day is disabled.
   */
  disabled: boolean;
  /**
   * Whether the day is not available.
   */
  unavailable: boolean;
  /**
   * Whether the day contains the current date.
   */
  current: boolean;
  /**
   * Whether the day is outside the month rendered by the day grid wrapping it.
   */
  outsideMonth: boolean;
}
export interface CalendarDayButtonProps extends Omit<BaseUIComponentProps<'button', CalendarDayButtonState>, 'value'>, NativeButtonProps {
  /**
   * The format used to display the day.
   * @default adapter.formats.dayOfMonth
   */
  format?: string | undefined;
  /**
   * When `true` the item remains focusable when disabled.
   * @default false
   */
  focusableWhenDisabled?: boolean | undefined;
}
export declare namespace CalendarDayButton {
  type State = CalendarDayButtonState;
  type Props = CalendarDayButtonProps;
}