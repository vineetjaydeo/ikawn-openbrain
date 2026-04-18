'use client';

import _formatErrorMessage from "@base-ui/utils/formatErrorMessage";
import * as React from 'react';
import { TemporalAdapterDateFns } from "../temporal-adapter-date-fns/TemporalAdapterDateFns.js";
/**
 * @internal
 */
export const TemporalAdapterContext = /*#__PURE__*/React.createContext({
  adapter: new TemporalAdapterDateFns()
});
if (process.env.NODE_ENV !== "production") TemporalAdapterContext.displayName = "TemporalAdapterContext";
export function useTemporalAdapter() {
  const context = React.useContext(TemporalAdapterContext);
  if (context === undefined) {
    throw new Error(process.env.NODE_ENV !== "production" ? 'Base UI: TemporalAdapterContext is missing. Temporal components must be place within <TemporalAdapterProvider />' : _formatErrorMessage(93));
  }
  return context.adapter;
}