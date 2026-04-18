"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarDayGridCell = void 0;
var React = _interopRequireWildcard(require("react"));
var _useRenderElement = require("../../utils/useRenderElement");
var _useSharedCalendarDayGridCell = require("./useSharedCalendarDayGridCell");
var _SharedCalendarDayGridCellContext = require("./SharedCalendarDayGridCellContext");
var _jsxRuntime = require("react/jsx-runtime");
const InnerCalendarDayGridCell = /*#__PURE__*/React.forwardRef(function InnerCalendarDayGridCell(componentProps, forwardedRef) {
  const {
    className,
    render,
    value,
    style,
    ...elementProps
  } = componentProps;
  const {
    props,
    context
  } = (0, _useSharedCalendarDayGridCell.useSharedCalendarDayGridCell)({
    value
  });
  const element = (0, _useRenderElement.useRenderElement)('td', componentProps, {
    ref: [forwardedRef],
    props: [props, elementProps]
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_SharedCalendarDayGridCellContext.SharedCalendarDayGridCellContext.Provider, {
    value: context,
    children: element
  });
});

/**
 * An individual day cell in the calendar.
 * Renders a `<td>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
if (process.env.NODE_ENV !== "production") InnerCalendarDayGridCell.displayName = "InnerCalendarDayGridCell";
const CalendarDayGridCell = exports.CalendarDayGridCell = /*#__PURE__*/React.memo(InnerCalendarDayGridCell);
if (process.env.NODE_ENV !== "production") CalendarDayGridCell.displayName = "CalendarDayGridCell";