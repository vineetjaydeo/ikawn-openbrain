"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarDayGridRow = void 0;
var React = _interopRequireWildcard(require("react"));
var _useRenderElement = require("../../utils/useRenderElement");
var _useCalendarDayList = require("../use-day-list/useCalendarDayList");
/**
 * Groups all cells of a given calendar's day grid row.
 * Renders a `<tr>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
const CalendarDayGridRow = exports.CalendarDayGridRow = /*#__PURE__*/React.forwardRef(function CalendarDayGridRow(componentProps, forwardedRef) {
  const {
    className,
    render,
    value,
    children,
    style,
    ...elementProps
  } = componentProps;
  const getDayList = (0, _useCalendarDayList.useCalendarDayList)();
  const days = React.useMemo(() => getDayList({
    date: value,
    amount: 7
  }), [getDayList, value]);
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
if (process.env.NODE_ENV !== "production") CalendarDayGridRow.displayName = "CalendarDayGridRow";