'use client';

import _formatErrorMessage from "@base-ui/utils/formatErrorMessage";
import * as React from 'react';
/**
 * @internal
 */
export const LocalizationContext = /*#__PURE__*/React.createContext(undefined);
if (process.env.NODE_ENV !== "production") LocalizationContext.displayName = "LocalizationContext";
export function useTemporalLocale() {
  const context = React.useContext(LocalizationContext);
  if (context === undefined) {
    throw new Error(process.env.NODE_ENV !== "production" ? 'Base UI: LocalizationContext is missing. Temporal components must be place within <LocalizationProvider />' : _formatErrorMessage(94));
  }
  return context.temporalLocale;
}