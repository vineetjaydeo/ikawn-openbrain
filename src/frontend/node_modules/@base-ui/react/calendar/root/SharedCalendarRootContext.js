"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SharedCalendarRootContext = void 0;
exports.useSharedCalendarRootContext = useSharedCalendarRootContext;
var _formatErrorMessage2 = _interopRequireDefault(require("@base-ui/utils/formatErrorMessage"));
var React = _interopRequireWildcard(require("react"));
const SharedCalendarRootContext = exports.SharedCalendarRootContext = /*#__PURE__*/React.createContext(undefined);
if (process.env.NODE_ENV !== "production") SharedCalendarRootContext.displayName = "SharedCalendarRootContext";
function useSharedCalendarRootContext() {
  const context = React.useContext(SharedCalendarRootContext);
  if (context === undefined) {
    throw new Error(process.env.NODE_ENV !== "production" ? 'Base UI: SharedCalendarRootContext is missing. Calendar parts must be placed within <Calendar.Root /> and Range Calendar parts must be placed within <RangeCalendar.Root />.' : (0, _formatErrorMessage2.default)(97));
  }
  return context;
}