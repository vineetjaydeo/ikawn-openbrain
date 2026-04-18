'use client';

import _formatErrorMessage from "@base-ui/utils/formatErrorMessage";
import * as React from 'react';
export const SharedCalendarDayGridCellContext = /*#__PURE__*/React.createContext(undefined);
if (process.env.NODE_ENV !== "production") SharedCalendarDayGridCellContext.displayName = "SharedCalendarDayGridCellContext";
export function useCalendarDayGridCellContext() {
  const context = React.useContext(SharedCalendarDayGridCellContext);
  if (context === undefined) {
    throw new Error(process.env.NODE_ENV !== "production" ? 'Base UI: SharedCalendarDayGridCellContext is missing. <Calendar.DayButton /> must be placed within <Calendar.DayGridCell /> and <RangeCalendar.DayButton /> must be placed within <RangeCalendar.DayGridCell />.' : _formatErrorMessage(96));
  }
  return context;
}