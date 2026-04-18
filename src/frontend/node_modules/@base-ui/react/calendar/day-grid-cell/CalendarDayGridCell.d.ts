import * as React from 'react';
import { BaseUIComponentProps } from "../../utils/types.js";
import { UseSharedCalendarDayGridCellParameters } from "./useSharedCalendarDayGridCell.js";
/**
 * An individual day cell in the calendar.
 * Renders a `<td>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare const CalendarDayGridCell: React.NamedExoticComponent<Omit<CalendarDayGridCellProps, "ref"> & React.RefAttributes<HTMLTableCellElement>>;
export interface CalendarDayGridCellState {}
export interface CalendarDayGridCellProps extends BaseUIComponentProps<'td', CalendarDayGridCellState>, UseSharedCalendarDayGridCellParameters {}
export declare namespace CalendarDayGridCell {
  type State = CalendarDayGridCellState;
  type Props = CalendarDayGridCellProps;
}