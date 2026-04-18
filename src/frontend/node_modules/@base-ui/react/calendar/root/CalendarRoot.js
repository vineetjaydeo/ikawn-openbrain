"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.calendarValueManager = exports.CalendarRoot = void 0;
var React = _interopRequireWildcard(require("react"));
var _store = require("@base-ui/utils/store");
var _useRefWithInit = require("@base-ui/utils/useRefWithInit");
var _SharedCalendarRootContext = require("./SharedCalendarRootContext");
var _getDateManager = require("../../utils/temporal/getDateManager");
var _useRenderElement = require("../../utils/useRenderElement");
var _dateHelpers = require("../../utils/temporal/date-helpers");
var _TemporalAdapterContext = require("../../temporal-adapter-provider/TemporalAdapterContext");
var _store2 = require("../store");
var _CalendarRootDataAttributes = require("./CalendarRootDataAttributes");
var _jsxRuntime = require("react/jsx-runtime");
const stateAttributesMapping = {
  navigationDirection: direction => {
    if (direction === 'none') {
      return null;
    }
    return {
      [_CalendarRootDataAttributes.CalendarRootDataAttributes.navigationDirection]: direction
    };
  }
};
const calendarValueManager = exports.calendarValueManager = {
  getDateToUseForReferenceDate: value => value,
  onSelectDate: ({
    setValue,
    selectedDate
  }) => setValue(selectedDate),
  getActiveDateFromValue: value => value
};

/**
 * Groups all parts of the calendar.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
const CalendarRoot = exports.CalendarRoot = /*#__PURE__*/React.forwardRef(function CalendarRoot(componentProps, forwardedRef) {
  const {
    // Rendering props
    className,
    render,
    // Form props
    readOnly,
    disabled,
    invalid,
    // Focus and navigation props
    monthPageSize,
    // Value props
    onValueChange,
    defaultValue,
    value,
    timezone,
    referenceDate,
    // Visible date props
    onVisibleDateChange,
    visibleDate,
    defaultVisibleDate,
    // Children
    children,
    // Validation props
    minDate,
    maxDate,
    isDateUnavailable,
    // Accessibility props
    'aria-label': ariaLabelProp,
    // Props forwarded to the DOM element
    style,
    ...elementProps
  } = componentProps;
  const adapter = (0, _TemporalAdapterContext.useTemporalAdapter)();
  const manager = React.useMemo(() => (0, _getDateManager.getDateManager)(adapter), [adapter]);
  const store = (0, _useRefWithInit.useRefWithInit)(() => new _store2.SharedCalendarStore({
    readOnly,
    disabled,
    invalid,
    monthPageSize,
    onValueChange,
    defaultValue,
    value,
    timezone,
    referenceDate,
    onVisibleDateChange,
    visibleDate,
    defaultVisibleDate,
    isDateUnavailable,
    minDate,
    maxDate
  }, adapter, manager, calendarValueManager)).current;
  store.useControlledProp('valueProp', value);
  store.useControlledProp('visibleDateProp', visibleDate);
  store.useContextCallback('onValueChange', onValueChange);
  store.useContextCallback('onVisibleDateChange', onVisibleDateChange);
  store.useSyncedValues({
    adapter,
    manager,
    timezoneProp: timezone,
    referenceDateProp: referenceDate ?? null,
    minDate,
    maxDate,
    isDateUnavailable,
    disabled: disabled ?? false,
    readOnly: readOnly ?? false,
    invalidProp: invalid,
    monthPageSize: monthPageSize ?? 1
  });
  const visibleMonth = (0, _store.useStore)(store, _store2.selectors.visibleMonth);
  const state = (0, _store.useStore)(store, _store2.selectors.rootElementState);
  const publicContext = (0, _store.useStore)(store, _store2.selectors.publicContext);
  const resolvedChildren = React.useMemo(() => {
    if (! /*#__PURE__*/React.isValidElement(children) && typeof children === 'function') {
      return children({
        ...publicContext,
        setVisibleDate: store.setVisibleDate
      });
    }
    return children;
  }, [children, publicContext, store.setVisibleDate]);

  // TODO: Improve localization support (right now it doesn't work well with RTL languages)
  const ariaLabel = React.useMemo(() => {
    const formattedVisibleMonth = (0, _dateHelpers.formatMonthFullLetterAndYear)(adapter, visibleMonth);
    const prefix = ariaLabelProp ? `${ariaLabelProp}, ` : '';
    return `${prefix}${formattedVisibleMonth}`;
  }, [adapter, ariaLabelProp, visibleMonth]);
  const element = (0, _useRenderElement.useRenderElement)('div', componentProps, {
    state,
    ref: forwardedRef,
    props: [{
      children: resolvedChildren,
      'aria-label': ariaLabel
    }, elementProps],
    stateAttributesMapping
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_SharedCalendarRootContext.SharedCalendarRootContext.Provider, {
    value: store,
    children: element
  });
});
if (process.env.NODE_ENV !== "production") CalendarRoot.displayName = "CalendarRoot";