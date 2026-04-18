'use client';

import * as React from 'react';
import { useRenderElement } from "../../utils/useRenderElement.js";
import { useSharedCalendarDayGridCell } from "./useSharedCalendarDayGridCell.js";
import { SharedCalendarDayGridCellContext } from "./SharedCalendarDayGridCellContext.js";
import { jsx as _jsx } from "react/jsx-runtime";
const InnerCalendarDayGridCell = /*#__PURE__*/React.forwardRef(function InnerCalendarDayGridCell(componentProps, forwardedRef) {
  const {
    className,
    render,
    value,
    style,
    ...elementProps
  } = componentProps;
  const {
    props,
    context
  } = useSharedCalendarDayGridCell({
    value
  });
  const element = useRenderElement('td', componentProps, {
    ref: [forwardedRef],
    props: [props, elementProps]
  });
  return /*#__PURE__*/_jsx(SharedCalendarDayGridCellContext.Provider, {
    value: context,
    children: element
  });
});

/**
 * An individual day cell in the calendar.
 * Renders a `<td>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
if (process.env.NODE_ENV !== "production") InnerCalendarDayGridCell.displayName = "InnerCalendarDayGridCell";
export const CalendarDayGridCell = /*#__PURE__*/React.memo(InnerCalendarDayGridCell);
if (process.env.NODE_ENV !== "production") CalendarDayGridCell.displayName = "CalendarDayGridCell";