import * as React from 'react';
import { BaseUIComponentProps } from "../../utils/types.js";
/**
 * Groups all parts of the calendar's day grid header.
 * Renders a `<thead>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare const CalendarDayGridHeader: React.ForwardRefExoticComponent<Omit<CalendarDayGridHeaderProps, "ref"> & React.RefAttributes<HTMLTableSectionElement>>;
export interface CalendarDayGridHeaderState {}
export interface CalendarDayGridHeaderProps extends BaseUIComponentProps<'thead', CalendarDayGridHeaderState> {}
export declare namespace CalendarDayGridHeader {
  type State = CalendarDayGridHeaderState;
  type Props = CalendarDayGridHeaderProps;
}