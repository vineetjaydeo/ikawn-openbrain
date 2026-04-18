"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SharedCalendarDayGridCellContext = void 0;
exports.useCalendarDayGridCellContext = useCalendarDayGridCellContext;
var _formatErrorMessage2 = _interopRequireDefault(require("@base-ui/utils/formatErrorMessage"));
var React = _interopRequireWildcard(require("react"));
const SharedCalendarDayGridCellContext = exports.SharedCalendarDayGridCellContext = /*#__PURE__*/React.createContext(undefined);
if (process.env.NODE_ENV !== "production") SharedCalendarDayGridCellContext.displayName = "SharedCalendarDayGridCellContext";
function useCalendarDayGridCellContext() {
  const context = React.useContext(SharedCalendarDayGridCellContext);
  if (context === undefined) {
    throw new Error(process.env.NODE_ENV !== "production" ? 'Base UI: SharedCalendarDayGridCellContext is missing. <Calendar.DayButton /> must be placed within <Calendar.DayGridCell /> and <RangeCalendar.DayButton /> must be placed within <RangeCalendar.DayGridCell />.' : (0, _formatErrorMessage2.default)(96));
  }
  return context;
}