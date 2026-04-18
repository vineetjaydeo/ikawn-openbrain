'use client';

import _formatErrorMessage from "@base-ui/utils/formatErrorMessage";
import * as React from 'react';
export const SharedCalendarRootContext = /*#__PURE__*/React.createContext(undefined);
if (process.env.NODE_ENV !== "production") SharedCalendarRootContext.displayName = "SharedCalendarRootContext";
export function useSharedCalendarRootContext() {
  const context = React.useContext(SharedCalendarRootContext);
  if (context === undefined) {
    throw new Error(process.env.NODE_ENV !== "production" ? 'Base UI: SharedCalendarRootContext is missing. Calendar parts must be placed within <Calendar.Root /> and Range Calendar parts must be placed within <RangeCalendar.Root />.' : _formatErrorMessage(97));
  }
  return context;
}