'use client';

import * as React from 'react';
import { useRenderElement } from "../../utils/useRenderElement.js";
import { useCalendarDayList } from "../use-day-list/useCalendarDayList.js";

/**
 * Groups all cells of a given calendar's day grid row.
 * Renders a `<tr>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export const CalendarDayGridRow = /*#__PURE__*/React.forwardRef(function CalendarDayGridRow(componentProps, forwardedRef) {
  const {
    className,
    render,
    value,
    children,
    style,
    ...elementProps
  } = componentProps;
  const getDayList = useCalendarDayList();
  const days = React.useMemo(() => getDayList({
    date: value,
    amount: 7
  }), [getDayList, value]);
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
if (process.env.NODE_ENV !== "production") CalendarDayGridRow.displayName = "CalendarDayGridRow";