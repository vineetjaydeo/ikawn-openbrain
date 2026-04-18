"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarDecrementMonth = void 0;
var React = _interopRequireWildcard(require("react"));
var _store = require("@base-ui/utils/store");
var _SharedCalendarRootContext = require("../root/SharedCalendarRootContext");
var _useRenderElement = require("../../utils/useRenderElement");
var _useButton = require("../../use-button");
var _TemporalAdapterContext = require("../../temporal-adapter-provider/TemporalAdapterContext");
var _store2 = require("../store");
var _useCalendarMonthButton = require("../utils/useCalendarMonthButton");
var _reasons = require("../../utils/reasons");
/**
 * Displays an element to navigate to the previous month in the calendar.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */

const CalendarDecrementMonth = exports.CalendarDecrementMonth = /*#__PURE__*/React.forwardRef(function CalendarDecrementMonth(componentProps, forwardedRef) {
  const {
    className,
    render,
    nativeButton,
    disabled: disabledProp,
    style,
    ...elementProps
  } = componentProps;
  const store = (0, _SharedCalendarRootContext.useSharedCalendarRootContext)();
  const adapter = (0, _TemporalAdapterContext.useTemporalAdapter)();
  const monthPageSize = (0, _store.useStore)(store, _store2.selectors.monthPageSize);
  const visibleDate = (0, _store.useStore)(store, _store2.selectors.visibleDate);
  const targetDate = React.useMemo(() => adapter.addMonths(visibleDate, -monthPageSize), [visibleDate, monthPageSize, adapter]);
  const isDisabled = (0, _store.useStore)(store, _store2.selectors.isSetMonthButtonDisabled, targetDate, disabledProp);
  const {
    getButtonProps,
    buttonRef
  } = (0, _useButton.useButton)({
    disabled: isDisabled,
    native: nativeButton,
    focusableWhenDisabled: true
  });
  const {
    pointerHandlers,
    autoChangeButtonRef,
    shouldSkipClick
  } = (0, _useCalendarMonthButton.useCalendarMonthButton)({
    direction: -1,
    disabled: isDisabled,
    disabledProp,
    store,
    adapter,
    monthPageSize
  });
  const state = React.useMemo(() => ({
    disabled: isDisabled
  }), [isDisabled]);
  const element = (0, _useRenderElement.useRenderElement)('button', componentProps, {
    state,
    ref: [buttonRef, autoChangeButtonRef, forwardedRef],
    props: [{
      tabIndex: 0,
      'aria-label': monthPageSize > 1 ? 'Previous months' : 'Previous month',
      onClick(event) {
        if (isDisabled || shouldSkipClick(event)) {
          return;
        }
        store.setVisibleDate(targetDate, event.nativeEvent, event.currentTarget, _reasons.REASONS.monthChange);
      },
      ...pointerHandlers
    }, elementProps, getButtonProps]
  });
  return element;
});
if (process.env.NODE_ENV !== "production") CalendarDecrementMonth.displayName = "CalendarDecrementMonth";