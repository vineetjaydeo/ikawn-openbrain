"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LocalizationProvider = void 0;
var React = _interopRequireWildcard(require("react"));
var _LocalizationContext = require("./LocalizationContext");
var _TemporalAdapterDateFns = require("../temporal-adapter-date-fns/TemporalAdapterDateFns");
var _TemporalAdapterContext = require("../temporal-adapter-provider/TemporalAdapterContext");
var _jsxRuntime = require("react/jsx-runtime");
/**
 * Defines the temporal locale provider for Base UI temporal components.
 *
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Localization Provider](https://base-ui.com/react/utils/localization-provider)
 */
const LocalizationProvider = exports.LocalizationProvider = function LocalizationProvider(props) {
  const {
    children,
    temporalLocale
  } = props;
  const contextValue = React.useMemo(() => ({
    temporalLocale
  }), [temporalLocale]);
  const adapterContextValue = React.useMemo(() => ({
    adapter: new _TemporalAdapterDateFns.TemporalAdapterDateFns({
      locale: temporalLocale
    })
  }), [temporalLocale]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_LocalizationContext.LocalizationContext.Provider, {
    value: contextValue,
    children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_TemporalAdapterContext.TemporalAdapterContext.Provider, {
      value: adapterContextValue,
      children: children
    })
  });
};
if (process.env.NODE_ENV !== "production") LocalizationProvider.displayName = "LocalizationProvider";