'use client';

import * as React from 'react';
import { LocalizationContext } from "./LocalizationContext.js";
import { TemporalAdapterDateFns } from "../temporal-adapter-date-fns/TemporalAdapterDateFns.js";
import { TemporalAdapterContext } from "../temporal-adapter-provider/TemporalAdapterContext.js";

/**
 * Defines the temporal locale provider for Base UI temporal components.
 *
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Localization Provider](https://base-ui.com/react/utils/localization-provider)
 */
import { jsx as _jsx } from "react/jsx-runtime";
export const LocalizationProvider = function LocalizationProvider(props) {
  const {
    children,
    temporalLocale
  } = props;
  const contextValue = React.useMemo(() => ({
    temporalLocale
  }), [temporalLocale]);
  const adapterContextValue = React.useMemo(() => ({
    adapter: new TemporalAdapterDateFns({
      locale: temporalLocale
    })
  }), [temporalLocale]);
  return /*#__PURE__*/_jsx(LocalizationContext.Provider, {
    value: contextValue,
    children: /*#__PURE__*/_jsx(TemporalAdapterContext.Provider, {
      value: adapterContextValue,
      children: children
    })
  });
};
if (process.env.NODE_ENV !== "production") LocalizationProvider.displayName = "LocalizationProvider";