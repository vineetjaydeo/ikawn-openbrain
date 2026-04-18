'use client';

import * as React from 'react';
import { useStore } from '@base-ui/utils/store';
import { useRenderElement } from "../../utils/useRenderElement.js";
import { CalendarDayButtonDataAttributes } from "./CalendarDayButtonDataAttributes.js";
import { useButton } from "../../use-button/index.js";
import { useSharedCalendarRootContext } from "../root/SharedCalendarRootContext.js";
import { useSharedCalendarDayGridBodyContext } from "../day-grid-body/SharedCalendarDayGridBodyContext.js";
import { useTemporalAdapter } from "../../temporal-adapter-provider/TemporalAdapterContext.js";
import { useCalendarDayGridCellContext } from "../day-grid-cell/SharedCalendarDayGridCellContext.js";
import { CompositeItem } from "../../composite/item/CompositeItem.js";
import { selectors } from "../store/index.js";
import { jsx as _jsx } from "react/jsx-runtime";
const stateAttributesMapping = {
  selected(value) {
    return value ? {
      [CalendarDayButtonDataAttributes.selected]: ''
    } : null;
  },
  disabled(value) {
    return value ? {
      [CalendarDayButtonDataAttributes.disabled]: ''
    } : null;
  },
  unavailable(value) {
    return value ? {
      [CalendarDayButtonDataAttributes.unavailable]: ''
    } : null;
  },
  current(value) {
    return value ? {
      [CalendarDayButtonDataAttributes.current]: ''
    } : null;
  },
  outsideMonth(value) {
    return value ? {
      [CalendarDayButtonDataAttributes.outsideMonth]: ''
    } : null;
  }
};
const InnerCalendarDayButton = /*#__PURE__*/React.forwardRef(function InnerCalendarDayButton(componentProps, forwardedRef) {
  const adapter = useTemporalAdapter();
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
  const store = useSharedCalendarRootContext();
  const {
    month,
    today
  } = useSharedCalendarDayGridBodyContext();
  const {
    isDisabled: isCellDisabled,
    isUnavailable,
    isOutsideCurrentMonth,
    value
  } = useCalendarDayGridCellContext();
  const isSelected = useStore(store, selectors.isDayButtonSelected, value);
  const isTabbable = useStore(store, selectors.isDayButtonTabbable, value, month);
  const isCurrent = adapter.isSameDay(value, today);
  const formattedDate = React.useMemo(() => adapter.format(value, 'localizedDateWithFullMonthAndWeekDay'), [adapter, value]);
  const isDisabled = disabled ?? isCellDisabled;
  const isInteractionDisabled = isDisabled || isOutsideCurrentMonth;
  const {
    getButtonProps,
    buttonRef
  } = useButton({
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
  const element = useRenderElement('button', componentProps, {
    state,
    ref: [buttonRef, forwardedRef],
    props: [props, elementProps, getButtonProps],
    stateAttributesMapping
  });
  return /*#__PURE__*/_jsx(CompositeItem, {
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
export const CalendarDayButton = /*#__PURE__*/React.memo(InnerCalendarDayButton);
if (process.env.NODE_ENV !== "production") CalendarDayButton.displayName = "CalendarDayButton";