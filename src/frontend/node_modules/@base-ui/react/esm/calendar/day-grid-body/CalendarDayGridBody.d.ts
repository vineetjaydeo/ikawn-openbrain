import * as React from 'react';
import { BaseUIComponentProps } from "../../utils/types.js";
import { UseSharedCalendarDayGridBodyParameters } from "./useSharedCalendarDayGridBody.js";
/**
 * Groups all parts of the calendar's day grid.
 * Renders a `<tbody>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare const CalendarDayGridBody: React.ForwardRefExoticComponent<Omit<CalendarDayGridBodyProps, "ref"> & React.RefAttributes<HTMLTableSectionElement>>;
export interface CalendarDayGridBodyState {}
export interface CalendarDayGridBodyProps extends Omit<BaseUIComponentProps<'tbody', CalendarDayGridBodyState>, 'children'>, UseSharedCalendarDayGridBodyParameters {}
export declare namespace CalendarDayGridBody {
  type State = CalendarDayGridBodyState;
  type Props = CalendarDayGridBodyProps;
}