"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SharedCalendarDayGridBodyContext = void 0;
exports.useSharedCalendarDayGridBodyContext = useSharedCalendarDayGridBodyContext;
var _formatErrorMessage2 = _interopRequireDefault(require("@base-ui/utils/formatErrorMessage"));
var React = _interopRequireWildcard(require("react"));
const SharedCalendarDayGridBodyContext = exports.SharedCalendarDayGridBodyContext = /*#__PURE__*/React.createContext(undefined);
if (process.env.NODE_ENV !== "production") SharedCalendarDayGridBodyContext.displayName = "SharedCalendarDayGridBodyContext";
function useSharedCalendarDayGridBodyContext() {
  const context = React.useContext(SharedCalendarDayGridBodyContext);
  if (context === undefined) {
    throw new Error(process.env.NODE_ENV !== "production" ? 'Base UI: SharedCalendarDayGridBodyContext is missing. <Calendar.DayGridRow /> must be placed within <Calendar.DayGridBody /> and <RangeCalendar.DayGridRow /> must be placed within <RangeCalendar.DayGridBody />.' : (0, _formatErrorMessage2.default)(95));
  }
  return context;
}