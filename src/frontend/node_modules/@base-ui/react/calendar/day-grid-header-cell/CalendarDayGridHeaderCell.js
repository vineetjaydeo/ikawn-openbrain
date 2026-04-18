"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarDayGridHeaderCell = void 0;
var React = _interopRequireWildcard(require("react"));
var _useRenderElement = require("../../utils/useRenderElement");
var _TemporalAdapterContext = require("../../temporal-adapter-provider/TemporalAdapterContext");
const InnerCalendarDayGridHeaderCell = /*#__PURE__*/React.forwardRef(function InnerCalendarDayGridHeaderCell(componentProps, forwardedRef) {
  const adapter = (0, _TemporalAdapterContext.useTemporalAdapter)();
  const defaultFormatter = React.useCallback(date => adapter.format(date, 'weekday3Letters').charAt(0).toUpperCase(), [adapter]);
  const {
    className,
    render,
    style,
    value,
    formatter = defaultFormatter,
    ...otherProps
  } = componentProps;
  const formattedValue = React.useMemo(() => formatter(value), [formatter, value]);
  const element = (0, _useRenderElement.useRenderElement)('th', componentProps, {
    ref: forwardedRef,
    props: [{
      children: formattedValue
    }, otherProps]
  });
  return element;
});

/**
 * An individual day header cell in the calendar.
 * Renders a `<th>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
if (process.env.NODE_ENV !== "production") InnerCalendarDayGridHeaderCell.displayName = "InnerCalendarDayGridHeaderCell";
const CalendarDayGridHeaderCell = exports.CalendarDayGridHeaderCell = /*#__PURE__*/React.memo(InnerCalendarDayGridHeaderCell);
if (process.env.NODE_ENV !== "production") CalendarDayGridHeaderCell.displayName = "CalendarDayGridHeaderCell";