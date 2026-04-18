"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useSharedCalendarDayGridCell = useSharedCalendarDayGridCell;
var React = _interopRequireWildcard(require("react"));
var _store = require("@base-ui/utils/store");
var _TemporalAdapterContext = require("../../temporal-adapter-provider/TemporalAdapterContext");
var _SharedCalendarDayGridBodyContext = require("../day-grid-body/SharedCalendarDayGridBodyContext");
var _SharedCalendarRootContext = require("../root/SharedCalendarRootContext");
var _store2 = require("../store");
function useSharedCalendarDayGridCell(parameters) {
  const {
    value
  } = parameters;
  const adapter = (0, _TemporalAdapterContext.useTemporalAdapter)();
  const store = (0, _SharedCalendarRootContext.useSharedCalendarRootContext)();
  const {
    month
  } = (0, _SharedCalendarDayGridBodyContext.useSharedCalendarDayGridBodyContext)();
  const isDisabled = (0, _store.useStore)(store, _store2.selectors.isDayCellDisabled, value);
  const isUnavailable = (0, _store.useStore)(store, _store2.selectors.isDayCellUnavailable, value);
  const isOutsideCurrentMonth = React.useMemo(() => month == null ? false : !adapter.isSameMonth(month, value), [month, value, adapter]);
  const props = {
    role: 'gridcell',
    'aria-disabled': isDisabled || isOutsideCurrentMonth || isUnavailable ? true : undefined
  };
  const context = React.useMemo(() => ({
    value,
    isDisabled,
    isUnavailable,
    isOutsideCurrentMonth
  }), [isDisabled, isUnavailable, isOutsideCurrentMonth, value]);
  return {
    props,
    context
  };
}