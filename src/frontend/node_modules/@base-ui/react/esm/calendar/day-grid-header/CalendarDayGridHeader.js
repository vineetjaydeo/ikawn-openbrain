'use client';

import * as React from 'react';
import { useRenderElement } from "../../utils/useRenderElement.js";

/**
 * Groups all parts of the calendar's day grid header.
 * Renders a `<thead>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export const CalendarDayGridHeader = /*#__PURE__*/React.forwardRef(function CalendarDayGridHeader(componentProps, forwardedRef) {
  const {
    className,
    render,
    style,
    ...elementProps
  } = componentProps;
  const element = useRenderElement('thead', componentProps, {
    ref: forwardedRef,
    props: [{
      'aria-hidden': true
    }, elementProps]
  });
  return element;
});
if (process.env.NODE_ENV !== "production") CalendarDayGridHeader.displayName = "CalendarDayGridHeader";