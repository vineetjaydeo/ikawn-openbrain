"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarDayButton = void 0;
var React = _interopRequireWildcard(require("react"));
var _store = require("@base-ui/utils/store");
var _useRenderElement = require("../../utils/useRenderElement");
var _CalendarDayButtonDataAttributes = require("./CalendarDayButtonDataAttributes");
var _useButton = require("../../use-button");
var _SharedCalendarRootContext = require("../root/SharedCalendarRootContext");
var _SharedCalendarDayGridBodyContext = require("../day-grid-body/SharedCalendarDayGridBodyContext");
var _TemporalAdapterContext = require("../../temporal-adapter-provider/TemporalAdapterContext");
var _SharedCalendarDayGridCellContext = require("../day-grid-cell/SharedCalendarDayGridCellContext");
var _CompositeItem = require("../../composite/item/CompositeItem");
var _store2 = require("../store");
var _jsxRuntime = require("react/jsx-runtime");
const stateAttributesMapping = {
  selected(value) {
    return value ? {
      [_CalendarDayButtonDataAttributes.CalendarDayButtonDataAttributes.selected]: ''
    } : null;
  },
  disabled(value) {
    return value ? {
      [_CalendarDayButtonDataAttributes.CalendarDayButtonDataAttributes.disabled]: ''
    } : null;
  },
  unavailable(value) {
    return value ? {
      [_CalendarDayButtonDataAttributes.CalendarDayButtonDataAttributes.unavailable]: ''
    } : null;
  },
  current(value) {
    return value ? {
      [_CalendarDayButtonDataAttributes.CalendarDayButtonDataAttributes.current]: ''
    } : null;
  },
  outsideMonth(value) {
    return value ? {
      [_CalendarDayButtonDataAttributes.CalendarDayButtonDataAttributes.outsideMonth]: ''
    } : null;
  }
};
const InnerCalendarDayButton = /*#__PURE__*/React.forwardRef(function InnerCalendarDayButton(componentProps, forwardedRef) {
  const adapter = (0, _TemporalAdapterContext.useTemporalAdapter)();
  const {
    className,
    render,
    nativeButton,
    format = adapter.formats.dayOfMonth,
    disabled,
    focusableWhenDisabled = false,
    style,
    ...elementProps
  } = componentProps;
  const store = (0, _SharedCalendarRootContext.useSharedCalendarRootContext)();
  const {
    month,
    today
  } = (0, _SharedCalendarDayGridBodyContext.useSharedCalendarDayGridBodyContext)();
  const {
    isDisabled: isCellDisabled,
    isUnavailable,
    isOutsideCurrentMonth,
    value
  } = (0, _SharedCalendarDayGridCellContext.useCalendarDayGridCellContext)();
  const isSelected = (0, _store.useStore)(store, _store2.selectors.isDayButtonSelected, value);
  const isTabbable = (0, _store.useStore)(store, _store2.selectors.isDayButtonTabbable, value, month);
  const isCurrent = adapter.isSameDay(value, today);
  const formattedDate = React.useMemo(() => adapter.format(value, 'localizedDateWithFullMonthAndWeekDay'), [adapter, value]);
  const isDisabled = disabled ?? isCellDisabled;
  const isInteractionDisabled = isDisabled || isOutsideCurrentMonth;
  const {
    getButtonProps,
    buttonRef
  } = (0, _useButton.useButton)({
    disabled: isInteractionDisabled,
    native: nativeButton,
    focusableWhenDisabled
  });
  const formattedValue = React.useMemo(() => adapter.formatByString(value, format), [adapter, value, format]);
  const itemMetadata = React.useMemo(() => ({
    focusable: (focusableWhenDisabled || !isDisabled) && !isOutsideCurrentMonth
  }), [focusableWhenDisabled, isDisabled, isOutsideCurrentMonth]);
  const props = {
    'aria-label': formattedDate,
    'aria-selected': isSelected ? true : undefined,
    'aria-current': isCurrent ? 'date' : undefined,
    'aria-disabled': isDisabled || isOutsideCurrentMonth || isUnavailable ? true : undefined,
    children: formattedValue,
    tabIndex: isTabbable ? 0 : -1,
    onClick(event) {
      if (isUnavailable || isInteractionDisabled) {
        return;
      }
      store.selectDate(value, event);
    }
  };
  const state = React.useMemo(() => ({
    selected: isSelected,
    disabled: isDisabled,
    unavailable: isUnavailable,
    current: isCurrent,
    outsideMonth: isOutsideCurrentMonth
  }), [isSelected, isDisabled, isUnavailable, isCurrent, isOutsideCurrentMonth]);
  const element = (0, _useRenderElement.useRenderElement)('button', componentProps, {
    state,
    ref: [buttonRef, forwardedRef],
    props: [props, elementProps, getButtonProps],
    stateAttributesMapping
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_CompositeItem.CompositeItem, {
    metadata: itemMetadata,
    render: element
  });
});

/**
 * An individual interactive day button in the calendar.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
if (process.env.NODE_ENV !== "production") InnerCalendarDayButton.displayName = "InnerCalendarDayButton";
const CalendarDayButton = exports.CalendarDayButton = /*#__PURE__*/React.memo(InnerCalendarDayButton);
if (process.env.NODE_ENV !== "production") CalendarDayButton.displayName = "CalendarDayButton";