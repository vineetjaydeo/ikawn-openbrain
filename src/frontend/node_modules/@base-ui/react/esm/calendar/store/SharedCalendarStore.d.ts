import { ReactStore } from '@base-ui/utils/store';
import { TemporalSupportedObject, TemporalSupportedValue, TemporalAdapter } from "../../types/temporal/index.js";
import { ValidateDateValidationProps } from "../../utils/temporal/validateDate.js";
import { TemporalManager, TemporalTimezoneProps } from "../../utils/temporal/types.js";
import { BaseUIChangeEventDetails } from "../../utils/createBaseUIEventDetails.js";
import { SharedCalendarState as State } from "./SharedCalendarState.js";
import { BaseUIEventReasons } from "../../utils/reasons.js";
export interface SharedCalendarStoreContext<TValue extends TemporalSupportedValue, TError> {
  onValueChange?: ((value: TValue, eventDetails: CalendarValueChangeEventDetails<TError>) => void) | undefined;
  onVisibleDateChange?: ((visibleDate: TemporalSupportedObject, eventDetails: CalendarVisibleDateChangeEventDetails) => void) | undefined;
}
/**
 * Store managing the state of the Calendar and the Range Calendar components.
 */
export declare class SharedCalendarStore<TValue extends TemporalSupportedValue, TError> extends ReactStore<State<TValue>, SharedCalendarStoreContext<TValue, TError>> {
  private valueManager;
  constructor(parameters: SharedCalendarStoreParameters<TValue, TError>, adapter: TemporalAdapter, manager: TemporalManager<TValue, TError, any>, valueManager: ValueManager<TValue>);
  /**
   * Sets the visible date.
   */
  setVisibleDate: (visibleDate: TemporalSupportedObject, nativeEvent?: Event, trigger?: HTMLElement, reason?: CalendarChangeEventReason) => void;
  /**
   * Selects a date.
   */
  selectDate: (selectedDate: TemporalSupportedObject, event: React.MouseEvent<HTMLButtonElement>) => void;
  /**
   * Sets the value.
   * Should only be used internally through `selectDate` method.
   */
  private setValue;
  /**
   * Determines the navigation direction based on the new and the previous visible date.
   */
  private getNavigationDirectionFromVisibleDateChange;
}
export interface SharedCalendarStoreParameters<TValue extends TemporalSupportedValue, TError> extends TemporalTimezoneProps, ValidateDateValidationProps {
  /**
   * The controlled value that should be selected.
   * To render an uncontrolled (Range)Calendar, use the `defaultValue` prop instead.
   */
  value?: TValue | undefined;
  /**
   * The uncontrolled value that should be initially selected.
   * To render a controlled (Range)Calendar, use the `value` prop instead.
   */
  defaultValue?: TValue | undefined;
  /**
   * Event handler called when the selected value changes.
   * Provides the new value as an argument.
   * Has `getValidationError()` in the `eventDetails` to retrieve the validation error associated to the new value.
   */
  onValueChange?: ((value: TValue, eventDetails: CalendarValueChangeEventDetails<TError>) => void) | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Whether the user should be unable to select a date in the calendar.
   * @default false
   */
  readOnly?: boolean | undefined;
  /**
   * Whether the calendar is forcefully marked as invalid.
   * A calendar can be invalid when the selected date fails validation (that is, is outside of the allowed `minDate` and `maxDate` range).
   * @default false
   */
  invalid?: boolean | undefined;
  /**
   * Mark specific dates as unavailable.
   * Those dates will not be selectable but they will still be focusable with the keyboard.
   */
  isDateUnavailable?: ((day: TemporalSupportedObject) => boolean) | undefined;
  /**
   * The date used to decide which month should be displayed in the Day Grid.
   * To render an uncontrolled Calendar, use the `defaultVisibleDate` prop instead.
   */
  visibleDate?: TemporalSupportedObject | undefined;
  /**
   * The date used to decide which month should be initially displayed in the Day Grid.
   * To render a controlled Calendar, use the `visibleDate` prop instead.
   */
  defaultVisibleDate?: TemporalSupportedObject | undefined;
  /**
   * Event handler called when the visible date changes.
   * Provides the new date as an argument.
   * Has the change reason in the `eventDetails`.
   */
  onVisibleDateChange?: ((visibleDate: TemporalSupportedObject, eventDetails: CalendarVisibleDateChangeEventDetails) => void) | undefined;
  /**
   * The date used to generate the new value when both `value` and `defaultValue` are empty.
   * It can be used to:
   * - set a desired time on the selected date;
   * - set a desired default year or month;
   * @default 'The closest valid date using the validation props.'
   */
  referenceDate?: TemporalSupportedObject | undefined;
  /**
   * The amount of months to move by when navigating.
   * This is mostly useful when displaying multiple day grids.
   * @default 1
   */
  monthPageSize?: number | undefined;
}
export interface ValueManager<TValue extends TemporalSupportedValue> {
  /**
   * Returns the date to use for the reference date.
   */
  getDateToUseForReferenceDate: (value: TValue) => TemporalSupportedObject | null;
  /**
   * Runs logic when a date is selected.
   * This is used to correctly update the value on the Range Calendar.
   */
  onSelectDate: (parameters: OnSelectDateParameters<TValue>) => void;
  /**
   * Returns the active date from the value.
   * This is used to determine which date is being edited in the Range Calendar (start of end date).
   */
  getActiveDateFromValue: (value: TValue) => TemporalSupportedObject | null;
}
export interface OnSelectDateParameters<TValue extends TemporalSupportedValue> {
  setValue: (value: TValue) => void;
  /**
   * The value before the change.
   */
  prevValue: TValue;
  /**
   * The date to select.
   */
  selectedDate: TemporalSupportedObject;
  /**
   * The reference date.
   */
  referenceDate: TemporalSupportedObject;
}
export interface CalendarValueChangeHandlerContext<TError> {
  /**
   * The validation error associated to the new value.
   */
  getValidationError: () => TError;
}
export type CalendarChangeEventReason = BaseUIEventReasons['monthChange'] | BaseUIEventReasons['valuePropChange'] | BaseUIEventReasons['dayPress'] | BaseUIEventReasons['keyboard'];
export type CalendarValueChangeEventDetails<TError> = BaseUIChangeEventDetails<CalendarChangeEventReason, CalendarValueChangeHandlerContext<TError>>;
export type CalendarVisibleDateChangeEventDetails = BaseUIChangeEventDetails<CalendarChangeEventReason, {}>;