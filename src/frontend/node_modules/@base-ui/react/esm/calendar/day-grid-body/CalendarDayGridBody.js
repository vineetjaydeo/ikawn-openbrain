'use client';

import * as React from 'react';
import { useRenderElement } from "../../utils/useRenderElement.js";
import { SharedCalendarDayGridBodyContext } from "./SharedCalendarDayGridBodyContext.js";
import { useSharedCalendarDayGridBody } from "./useSharedCalendarDayGridBody.js";
import { CompositeRoot } from "../../composite/root/CompositeRoot.js";

/**
 * Groups all parts of the calendar's day grid.
 * Renders a `<tbody>` element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
import { jsx as _jsx } from "react/jsx-runtime";
export const CalendarDayGridBody = /*#__PURE__*/React.forwardRef(function CalendarDayGridBody(componentProps, forwardedRef) {
  const {
    className,
    render,
    children,
    fixedWeekNumber,
    offset,
    style,
    ...elementProps
  } = componentProps;
  const {
    props,
    compositeRootProps,
    context,
    ref
  } = useSharedCalendarDayGridBody({
    children,
    fixedWeekNumber,
    offset
  });
  const element = useRenderElement('tbody', componentProps, {
    ref: [forwardedRef, ref],
    props: [props, elementProps]
  });
  return /*#__PURE__*/_jsx(SharedCalendarDayGridBodyContext.Provider, {
    value: context,
    children: /*#__PURE__*/_jsx(CompositeRoot, {
      ...compositeRootProps,
      render: element
    })
  });
});
if (process.env.NODE_ENV !== "production") CalendarDayGridBody.displayName = "CalendarDayGridBody";