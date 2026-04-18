import * as React from 'react';
import { CalendarNavigationDirection } from "../store/index.js";
/**
 * A viewport for displaying calendar month transitions.
 * This component is only required if you want to animate certain part of a calendar when navigating between months.
 * The first rendered child element has to handle a ref.
 * Passes `data-current` to the currently visible content and `data-previous` to the previous content when animating between two.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
export declare function CalendarViewport({
  children
}: CalendarViewport.Props): React.JSX.Element;
export interface CalendarViewportProps {
  /**
   * The content to render inside the transition container.
   */
  children: React.JSX.Element;
}
export interface CalendarViewportState {
  /**
   * Indicates the direction of the navigation (based on the month navigating to).
   */
  navigationDirection: CalendarNavigationDirection;
}
export declare namespace CalendarViewport {
  type Props = CalendarViewportProps;
  type State = CalendarViewportState;
}