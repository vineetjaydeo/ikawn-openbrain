'use client';

import * as React from 'react';
import { useRenderElement } from "../../utils/useRenderElement.js";
import { useTemporalAdapter } from "../../temporal-adapter-provider/TemporalAdapterContext.js";
import { useCalendarDayList } from "../use-day-list/useCalendarDayList.js";

/**
 * Groups all cells of the calendar's day grid header row.
 * Renders a `<tr>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export const CalendarDayGridHeaderRow = /*#__PURE__*/React.forwardRef(function CalendarDayGridHeaderRow(componentProps, forwardedRef) {
  const {
    className,
    render,
    children,
    style,
    ...elementProps
  } = componentProps;
  const adapter = useTemporalAdapter();
  const getDayList = useCalendarDayList();
  const days = React.useMemo(() => getDayList({
    date: adapter.startOfWeek(adapter.now('default')),
    amount: 7
  }), [adapter, getDayList]);
  const resolvedChildren = React.useMemo(() => {
    if (! /*#__PURE__*/React.isValidElement(children) && typeof children === 'function') {
      return days.map(children);
    }
    return children;
  }, [children, days]);
  const element = useRenderElement('tr', componentProps, {
    ref: forwardedRef,
    props: [{
      children: resolvedChildren
    }, elementProps]
  });
  return element;
});
if (process.env.NODE_ENV !== "production") CalendarDayGridHeaderRow.displayName = "CalendarDayGridHeaderRow";