import * as React from 'react';
import { TemporalValue } from "../../types/temporal/index.js";
import { CalendarContext } from "../use-context/CalendarContext.js";
import { BaseUIComponentProps } from "../../utils/types.js";
import { CalendarNavigationDirection, CalendarValueChangeHandlerContext, CalendarRootElementState, ValueManager, SharedCalendarStoreParameters, CalendarChangeEventReason, CalendarValueChangeEventDetails, CalendarVisibleDateChangeEventDetails } from "../store/index.js";
import { ValidateDateReturnValue } from "../../utils/temporal/validateDate.js";
export declare const calendarValueManager: ValueManager<TemporalValue>;
/**
 * Groups all parts of the calendar.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare const CalendarRoot: React.ForwardRefExoticComponent<Omit<CalendarRootProps, "ref"> & React.RefAttributes<HTMLDivElement>>;
export type CalendarRootNavigationDirection = CalendarNavigationDirection;
export interface CalendarRootState extends CalendarRootElementState {}
export interface CalendarRootProps extends Omit<BaseUIComponentProps<'div', CalendarRootState>, 'children'>, SharedCalendarStoreParameters<TemporalValue, ValidateDateReturnValue> {
  /**
   * The children of the component.
   * If a function is provided, it will be called with the public context as its parameter.
   */
  children?: React.ReactNode | ((parameters: CalendarContext) => React.ReactNode);
}
export interface CalendarRootValueChangeHandlerContext extends CalendarValueChangeHandlerContext<ValidateDateReturnValue> {}
export type CalendarRootChangeEventReason = CalendarChangeEventReason;
export type CalendarRootValueChangeEventDetails = CalendarValueChangeEventDetails<ValidateDateReturnValue>;
export type CalendarRootVisibleDateChangeEventDetails = CalendarVisibleDateChangeEventDetails;
export declare namespace CalendarRoot {
  type NavigationDirection = CalendarRootNavigationDirection;
  type State = CalendarRootState;
  type Props = CalendarRootProps;
  type ValueChangeHandlerContext = CalendarRootValueChangeHandlerContext;
  type ChangeEventReason = CalendarRootChangeEventReason;
  type ValueChangeEventDetails = CalendarRootValueChangeEventDetails;
  type VisibleDateChangeEventDetails = CalendarRootVisibleDateChangeEventDetails;
}