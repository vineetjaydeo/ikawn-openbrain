"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TemporalAdapterContext = void 0;
exports.useTemporalAdapter = useTemporalAdapter;
var _formatErrorMessage2 = _interopRequireDefault(require("@base-ui/utils/formatErrorMessage"));
var React = _interopRequireWildcard(require("react"));
var _TemporalAdapterDateFns = require("../temporal-adapter-date-fns/TemporalAdapterDateFns");
/**
 * @internal
 */
const TemporalAdapterContext = exports.TemporalAdapterContext = /*#__PURE__*/React.createContext({
  adapter: new _TemporalAdapterDateFns.TemporalAdapterDateFns()
});
if (process.env.NODE_ENV !== "production") TemporalAdapterContext.displayName = "TemporalAdapterContext";
function useTemporalAdapter() {
  const context = React.useContext(TemporalAdapterContext);
  if (context === undefined) {
    throw new Error(process.env.NODE_ENV !== "production" ? 'Base UI: TemporalAdapterContext is missing. Temporal components must be place within <TemporalAdapterProvider />' : (0, _formatErrorMessage2.default)(93));
  }
  return context.adapter;
}