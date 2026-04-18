'use client';

import * as React from 'react';
import { useRenderElement } from "../../utils/useRenderElement.js";

/**
 * Groups all the parts of the calendar's day grid.
 * Renders a `<table>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export const CalendarDayGrid = /*#__PURE__*/React.forwardRef(function CalendarDayGrid(componentProps, forwardedRef) {
  const {
    className,
    render,
    style,
    ...elementProps
  } = componentProps;
  const element = useRenderElement('table', componentProps, {
    ref: forwardedRef,
    props: [{
      role: 'grid'
    }, elementProps]
  });
  return element;
});
if (process.env.NODE_ENV !== "production") CalendarDayGrid.displayName = "CalendarDayGrid";