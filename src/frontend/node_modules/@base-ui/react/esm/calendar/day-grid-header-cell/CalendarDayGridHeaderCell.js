'use client';

import * as React from 'react';
import { useRenderElement } from "../../utils/useRenderElement.js";
import { useTemporalAdapter } from "../../temporal-adapter-provider/TemporalAdapterContext.js";
const InnerCalendarDayGridHeaderCell = /*#__PURE__*/React.forwardRef(function InnerCalendarDayGridHeaderCell(componentProps, forwardedRef) {
  const adapter = useTemporalAdapter();
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
  const element = useRenderElement('th', componentProps, {
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
export const CalendarDayGridHeaderCell = /*#__PURE__*/React.memo(InnerCalendarDayGridHeaderCell);
if (process.env.NODE_ENV !== "production") CalendarDayGridHeaderCell.displayName = "CalendarDayGridHeaderCell";