"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TemporalAdapterProvider = void 0;
var React = _interopRequireWildcard(require("react"));
var _TemporalAdapterContext = require("./TemporalAdapterContext");
var _jsxRuntime = require("react/jsx-runtime");
/**
 * Defines the date library adapter for Base UI temporal components.
 */
const TemporalAdapterProvider = exports.TemporalAdapterProvider = function DateAdapterProvider(props) {
  const {
    children,
    adapter
  } = props;
  const contextValue = React.useMemo(() => ({
    adapter
  }), [adapter]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_TemporalAdapterContext.TemporalAdapterContext.Provider, {
    value: contextValue,
    children: children
  });
};
if (process.env.NODE_ENV !== "production") TemporalAdapterProvider.displayName = "TemporalAdapterProvider";