'use client';

import _formatErrorMessage from "@base-ui/utils/formatErrorMessage";
import * as React from 'react';
export const SharedCalendarDayGridBodyContext = /*#__PURE__*/React.createContext(undefined);
if (process.env.NODE_ENV !== "production") SharedCalendarDayGridBodyContext.displayName = "SharedCalendarDayGridBodyContext";
export function useSharedCalendarDayGridBodyContext() {
  const context = React.useContext(SharedCalendarDayGridBodyContext);
  if (context === undefined) {
    throw new Error(process.env.NODE_ENV !== "production" ? 'Base UI: SharedCalendarDayGridBodyContext is missing. <Calendar.DayGridRow /> must be placed within <Calendar.DayGridBody /> and <RangeCalendar.DayGridRow /> must be placed within <RangeCalendar.DayGridBody />.' : _formatErrorMessage(95));
  }
  return context;
}