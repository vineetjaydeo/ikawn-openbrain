import * as React from 'react';
import { BaseUIComponentProps } from "../../utils/types.js";
import { TemporalSupportedObject } from "../../types/temporal/index.js";
/**
 * Groups all cells of a given calendar's day grid row.
 * Renders a `<tr>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare const CalendarDayGridRow: React.ForwardRefExoticComponent<Omit<CalendarDayGridRowProps, "ref"> & React.RefAttributes<HTMLTableRowElement>>;
export interface CalendarDayGridRowState {}
export interface CalendarDayGridRowProps extends Omit<BaseUIComponentProps<'tr', CalendarDayGridRowState>, 'children'> {
  /**
   * The date object representing the week.
   */
  value: TemporalSupportedObject;
  /**
   * The children of the component.
   * If a function is provided, it will be called for each day of the week as its parameter.
   */
  children?: React.ReactNode | ((day: TemporalSupportedObject, index: number, days: TemporalSupportedObject[]) => React.ReactNode);
}
export declare namespace CalendarDayGridRow {
  type State = CalendarDayGridRowState;
  type Props = CalendarDayGridRowProps;
}