'use client';

import * as React from 'react';
import { TemporalAdapterContext } from "./TemporalAdapterContext.js";

/**
 * Defines the date library adapter for Base UI temporal components.
 */
import { jsx as _jsx } from "react/jsx-runtime";
export const TemporalAdapterProvider = function DateAdapterProvider(props) {
  const {
    children,
    adapter
  } = props;
  const contextValue = React.useMemo(() => ({
    adapter
  }), [adapter]);
  return /*#__PURE__*/_jsx(TemporalAdapterContext.Provider, {
    value: contextValue,
    children: children
  });
};
if (process.env.NODE_ENV !== "production") TemporalAdapterProvider.displayName = "TemporalAdapterProvider";