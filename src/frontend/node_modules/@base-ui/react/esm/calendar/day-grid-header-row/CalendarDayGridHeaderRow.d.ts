import * as React from 'react';
import { BaseUIComponentProps } from "../../utils/types.js";
import { TemporalSupportedObject } from "../../types/temporal/index.js";
/**
 * Groups all cells of the calendar's day grid header row.
 * Renders a `<tr>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare const CalendarDayGridHeaderRow: React.ForwardRefExoticComponent<Omit<CalendarDayGridHeaderRowProps, "ref"> & React.RefAttributes<HTMLTableRowElement>>;
export interface CalendarDayGridHeaderRowState {}
export interface CalendarDayGridHeaderRowProps extends Omit<BaseUIComponentProps<'tr', CalendarDayGridHeaderRowState>, 'children'> {
  /**
   * The children of the component.
   * If a function is provided, it will be called for each day of the week as its parameter.
   */
  children?: React.ReactNode | ((day: TemporalSupportedObject, index: number, days: TemporalSupportedObject[]) => React.ReactNode);
}
export declare namespace CalendarDayGridHeaderRow {
  type State = CalendarDayGridHeaderRowState;
  type Props = CalendarDayGridHeaderRowProps;
}