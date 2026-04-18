"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarDayGridHeader = void 0;
var React = _interopRequireWildcard(require("react"));
var _useRenderElement = require("../../utils/useRenderElement");
/**
 * Groups all parts of the calendar's day grid header.
 * Renders a `<thead>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
const CalendarDayGridHeader = exports.CalendarDayGridHeader = /*#__PURE__*/React.forwardRef(function CalendarDayGridHeader(componentProps, forwardedRef) {
  const {
    className,
    render,
    style,
    ...elementProps
  } = componentProps;
  const element = (0, _useRenderElement.useRenderElement)('thead', componentProps, {
    ref: forwardedRef,
    props: [{
      'aria-hidden': true
    }, elementProps]
  });
  return element;
});
if (process.env.NODE_ENV !== "production") CalendarDayGridHeader.displayName = "CalendarDayGridHeader";