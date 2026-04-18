"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarDayGridBody = void 0;
var React = _interopRequireWildcard(require("react"));
var _useRenderElement = require("../../utils/useRenderElement");
var _SharedCalendarDayGridBodyContext = require("./SharedCalendarDayGridBodyContext");
var _useSharedCalendarDayGridBody = require("./useSharedCalendarDayGridBody");
var _CompositeRoot = require("../../composite/root/CompositeRoot");
var _jsxRuntime = require("react/jsx-runtime");
/**
 * Groups all parts of the calendar's day grid.
 * Renders a `<tbody>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
const CalendarDayGridBody = exports.CalendarDayGridBody = /*#__PURE__*/React.forwardRef(function CalendarDayGridBody(componentProps, forwardedRef) {
  const {
    className,
    render,
    children,
    fixedWeekNumber,
    offset,
    style,
    ...elementProps
  } = componentProps;
  const {
    props,
    compositeRootProps,
    context,
    ref
  } = (0, _useSharedCalendarDayGridBody.useSharedCalendarDayGridBody)({
    children,
    fixedWeekNumber,
    offset
  });
  const element = (0, _useRenderElement.useRenderElement)('tbody', componentProps, {
    ref: [forwardedRef, ref],
    props: [props, elementProps]
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_SharedCalendarDayGridBodyContext.SharedCalendarDayGridBodyContext.Provider, {
    value: context,
    children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_CompositeRoot.CompositeRoot, {
      ...compositeRootProps,
      render: element
    })
  });
});
if (process.env.NODE_ENV !== "production") CalendarDayGridBody.displayName = "CalendarDayGridBody";