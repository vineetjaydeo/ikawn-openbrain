import * as React from 'react';
import { BaseUIComponentProps } from "../../utils/types.js";
import { TemporalSupportedObject } from "../../types/temporal/index.js";
/**
 * An individual day header cell in the calendar.
 * Renders a `<th>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare const CalendarDayGridHeaderCell: React.NamedExoticComponent<Omit<CalendarDayGridHeaderCellProps, "ref"> & React.RefAttributes<HTMLTableCellElement>>;
export interface CalendarDayGridHeaderCellState {}
export interface CalendarDayGridHeaderCellProps extends BaseUIComponentProps<'th', CalendarDayGridHeaderCellState> {
  value: TemporalSupportedObject;
  /**
   * The formatter function used to display the day of the week.
   * @param {TemporalSupportedObject} date The date to format.
   * @returns {string} The formatted date.
   * @default (date) => adapter.format(date, 'EEE').charAt(0).toUpperCase()
   */
  formatter?: ((date: TemporalSupportedObject) => string) | undefined;
}
export declare namespace CalendarDayGridHeaderCell {
  type State = CalendarDayGridHeaderCellState;
  type Props = CalendarDayGridHeaderCellProps;
}