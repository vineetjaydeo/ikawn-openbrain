'use client';

import * as React from 'react';
import { useStore } from '@base-ui/utils/store';
import { useRefWithInit } from '@base-ui/utils/useRefWithInit';
import { SharedCalendarRootContext } from "./SharedCalendarRootContext.js";
import { getDateManager } from "../../utils/temporal/getDateManager.js";
import { useRenderElement } from "../../utils/useRenderElement.js";
import { formatMonthFullLetterAndYear } from "../../utils/temporal/date-helpers.js";
import { useTemporalAdapter } from "../../temporal-adapter-provider/TemporalAdapterContext.js";
import { selectors, SharedCalendarStore } from "../store/index.js";
import { CalendarRootDataAttributes } from "./CalendarRootDataAttributes.js";
import { jsx as _jsx } from "react/jsx-runtime";
const stateAttributesMapping = {
  navigationDirection: direction => {
    if (direction === 'none') {
      return null;
    }
    return {
      [CalendarRootDataAttributes.navigationDirection]: direction
    };
  }
};
export const calendarValueManager = {
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
export const CalendarRoot = /*#__PURE__*/React.forwardRef(function CalendarRoot(componentProps, forwardedRef) {
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
  const adapter = useTemporalAdapter();
  const manager = React.useMemo(() => getDateManager(adapter), [adapter]);
  const store = useRefWithInit(() => new SharedCalendarStore({
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
  const visibleMonth = useStore(store, selectors.visibleMonth);
  const state = useStore(store, selectors.rootElementState);
  const publicContext = useStore(store, selectors.publicContext);
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
    const formattedVisibleMonth = formatMonthFullLetterAndYear(adapter, visibleMonth);
    const prefix = ariaLabelProp ? `${ariaLabelProp}, ` : '';
    return `${prefix}${formattedVisibleMonth}`;
  }, [adapter, ariaLabelProp, visibleMonth]);
  const element = useRenderElement('div', componentProps, {
    state,
    ref: forwardedRef,
    props: [{
      children: resolvedChildren,
      'aria-label': ariaLabel
    }, elementProps],
    stateAttributesMapping
  });
  return /*#__PURE__*/_jsx(SharedCalendarRootContext.Provider, {
    value: store,
    children: element
  });
});
if (process.env.NODE_ENV !== "production") CalendarRoot.displayName = "CalendarRoot";