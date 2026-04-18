import { TemporalSupportedValue } from "../../types/temporal/index.js";
import { CalendarNavigationDirection, SharedCalendarState as State } from "./SharedCalendarState.js";
export declare const selectors: {
  /**
   * Returns the timezone to use for rendering.
   */
  timezoneToRender: (args_0: State<any>) => string;
  /**
   * Returns the state of the root element.
   */
  rootElementState: (args_0: State<any>) => {
    empty: boolean;
    invalid: boolean;
    disabled: boolean;
    readOnly: boolean;
    navigationDirection: CalendarNavigationDirection;
  };
  /**
   * Returns the context to publicly expose in render functions and hooks.
   */
  publicContext: (args_0: State<any>) => {
    visibleDate: Date;
  };
  /**
   * Returns the props to check if a date is valid or not.
   */
  validationProps: (args_0: State<any>) => {
    minDate: Date | undefined;
    maxDate: Date | undefined;
  };
  /**
   * Returns the amount of months to navigate by when pressing `<Calendar.IncrementMonth>` or `<Calendar.DecrementMonth>`.
   */
  monthPageSize: (state: State<any>) => number;
  /**
   * Returns the date currently visible.
   */
  visibleDate: (args_0: State<any>) => Date;
  /**
   * Returns the current visible month.
   */
  visibleMonth: (args_0: State<any>) => Date;
  /**
   * Returns the navigation direction.
   */
  navigationDirection: (state: State<any>) => CalendarNavigationDirection;
  /**
   * Returns the current value with the timezone to render applied.
   */
  valueWithTimezoneToRender: <TValue extends TemporalSupportedValue>(state: State<TValue>) => TValue;
  /**
   * Returns the reference date.
   */
  referenceDate: (args_0: State<any>) => Date;
  /**
   * Returns the list of currently selected dates.
   * When used inside the Calendar component, it contains the current value if not null.
   * When used inside the RangeCalendar component, it contains the selected start and/or end dates if not null.
   */
  selectedDates: (args_0: State<any>) => any[];
  /**
   * Checks if a day cell should be disabled.
   */
  isDayCellDisabled: (state: State<any>, value: Date) => boolean;
  /**
   * Checks if a day cell should be selected.
   */
  isDayButtonSelected: (args_0: State<any>, cellValue: Date) => boolean;
  /**
   * Checks if a specific dates is unavailable.
   * If so, this date should not be selectable but should still be focusable with the keyboard.
   */
  isDayCellUnavailable: (state: State<any>, value: Date) => boolean;
  /**
   * Checks if a month navigation button should be disabled.
   */
  isSetMonthButtonDisabled: (args_0: State<any>, targetDate: Date, disabledProp: boolean | undefined) => boolean;
  /**
   * Checks if a day should be reachable using tab navigation.
   */
  isDayButtonTabbable: (args_0: State<any>, date: Date, month: Date) => boolean;
};
export interface CalendarRootElementState {
  /**
   * Whether the current value is empty.
   */
  empty: boolean;
  /**
   * Whether the current value is invalid.
   */
  invalid: boolean;
  /**
   * Whether the calendar is disabled.
   */
  disabled: boolean;
  /**
   * Whether the calendar is readonly.
   */
  readOnly?: boolean | undefined;
  /**
   * The direction of the navigation (based on the month navigating to).
   */
  navigationDirection: CalendarNavigationDirection;
}