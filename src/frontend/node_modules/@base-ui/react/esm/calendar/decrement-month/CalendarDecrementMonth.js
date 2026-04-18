'use client';

import * as React from 'react';
import { useStore } from '@base-ui/utils/store';
import { useSharedCalendarRootContext } from "../root/SharedCalendarRootContext.js";
import { useRenderElement } from "../../utils/useRenderElement.js";
import { useButton } from "../../use-button/index.js";
import { useTemporalAdapter } from "../../temporal-adapter-provider/TemporalAdapterContext.js";
import { selectors } from "../store/index.js";
import { useCalendarMonthButton } from "../utils/useCalendarMonthButton.js";
import { REASONS } from "../../utils/reasons.js";

/**
 * Displays an element to navigate to the previous month in the calendar.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */

export const CalendarDecrementMonth = /*#__PURE__*/React.forwardRef(function CalendarDecrementMonth(componentProps, forwardedRef) {
  const {
    className,
    render,
    nativeButton,
    disabled: disabledProp,
    style,
    ...elementProps
  } = componentProps;
  const store = useSharedCalendarRootContext();
  const adapter = useTemporalAdapter();
  const monthPageSize = useStore(store, selectors.monthPageSize);
  const visibleDate = useStore(store, selectors.visibleDate);
  const targetDate = React.useMemo(() => adapter.addMonths(visibleDate, -monthPageSize), [visibleDate, monthPageSize, adapter]);
  const isDisabled = useStore(store, selectors.isSetMonthButtonDisabled, targetDate, disabledProp);
  const {
    getButtonProps,
    buttonRef
  } = useButton({
    disabled: isDisabled,
    native: nativeButton,
    focusableWhenDisabled: true
  });
  const {
    pointerHandlers,
    autoChangeButtonRef,
    shouldSkipClick
  } = useCalendarMonthButton({
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
  const element = useRenderElement('button', componentProps, {
    state,
    ref: [buttonRef, autoChangeButtonRef, forwardedRef],
    props: [{
      tabIndex: 0,
      'aria-label': monthPageSize > 1 ? 'Previous months' : 'Previous month',
      onClick(event) {
        if (isDisabled || shouldSkipClick(event)) {
          return;
        }
        store.setVisibleDate(targetDate, event.nativeEvent, event.currentTarget, REASONS.monthChange);
      },
      ...pointerHandlers
    }, elementProps, getButtonProps]
  });
  return element;
});
if (process.env.NODE_ENV !== "production") CalendarDecrementMonth.displayName = "CalendarDecrementMonth";