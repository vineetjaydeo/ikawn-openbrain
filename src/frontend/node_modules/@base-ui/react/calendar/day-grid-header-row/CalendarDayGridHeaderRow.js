"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarDayGridHeaderRow = void 0;
var React = _interopRequireWildcard(require("react"));
var _useRenderElement = require("../../utils/useRenderElement");
var _TemporalAdapterContext = require("../../temporal-adapter-provider/TemporalAdapterContext");
var _useCalendarDayList = require("../use-day-list/useCalendarDayList");
/**
 * Groups all cells of the calendar's day grid header row.
 * Renders a `<tr>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
const CalendarDayGridHeaderRow = exports.CalendarDayGridHeaderRow = /*#__PURE__*/React.forwardRef(function CalendarDayGridHeaderRow(componentProps, forwardedRef) {
  const {
    className,
    render,
    children,
    style,
    ...elementProps
  } = componentProps;
  const adapter = (0, _TemporalAdapterContext.useTemporalAdapter)();
  const getDayList = (0, _useCalendarDayList.useCalendarDayList)();
  const days = React.useMemo(() => getDayList({
    date: adapter.startOfWeek(adapter.now('default')),
    amount: 7
  }), [adapter, getDayList]);
  const resolvedChildren = React.useMemo(() => {
    if (! /*#__PURE__*/React.isValidElement(children) && typeof children === 'function') {
      return days.map(children);
    }
    return children;
  }, [children, days]);
  const element = (0, _useRenderElement.useRenderElement)('tr', componentProps, {
    ref: forwardedRef,
    props: [{
      children: resolvedChildren
    }, elementProps]
  });
  return element;
});
if (process.env.NODE_ENV !== "production") CalendarDayGridHeaderRow.displayName = "CalendarDayGridHeaderRow";