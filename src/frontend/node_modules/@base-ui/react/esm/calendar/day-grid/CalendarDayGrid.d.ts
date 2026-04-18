import * as React from 'react';
import { BaseUIComponentProps } from "../../utils/types.js";
/**
 * Groups all the parts of the calendar's day grid.
 * Renders a `<table>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare const CalendarDayGrid: React.ForwardRefExoticComponent<Omit<CalendarDayGridProps, "ref"> & React.RefAttributes<HTMLTableElement>>;
export interface CalendarDayGridState {}
export interface CalendarDayGridProps extends BaseUIComponentProps<'table', CalendarDayGridState> {}
export declare namespace CalendarDayGrid {
  type State = CalendarDayGridState;
  type Props = CalendarDayGridProps;
}