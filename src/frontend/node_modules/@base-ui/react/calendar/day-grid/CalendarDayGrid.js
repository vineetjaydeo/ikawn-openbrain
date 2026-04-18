"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarDayGrid = void 0;
var React = _interopRequireWildcard(require("react"));
var _useRenderElement = require("../../utils/useRenderElement");
/**
 * Groups all the parts of the calendar's day grid.
 * Renders a `<table>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
const CalendarDayGrid = exports.CalendarDayGrid = /*#__PURE__*/React.forwardRef(function CalendarDayGrid(componentProps, forwardedRef) {
  const {
    className,
    render,
    style,
    ...elementProps
  } = componentProps;
  const element = (0, _useRenderElement.useRenderElement)('table', componentProps, {
    ref: forwardedRef,
    props: [{
      role: 'grid'
    }, elementProps]
  });
  return element;
});
if (process.env.NODE_ENV !== "production") CalendarDayGrid.displayName = "CalendarDayGrid";