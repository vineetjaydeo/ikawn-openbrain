import * as React from 'react';
import type { SharedCalendarStore } from "../store/SharedCalendarStore.js";
import type { TemporalSupportedValue, TemporalAdapter } from "../../types/temporal/index.js";
interface UseCalendarMonthButtonParameters {
  direction: 1 | -1;
  disabled: boolean;
  disabledProp?: boolean | undefined;
  store: SharedCalendarStore<TemporalSupportedValue, unknown>;
  adapter: TemporalAdapter;
  monthPageSize: number;
}
/**
 * Adds press-and-hold behavior to Calendar month navigation buttons.
 * On pointer down, performs one navigation immediately, then after a delay
 * starts continuous navigation at a fixed interval.
 */
export declare function useCalendarMonthButton(params: UseCalendarMonthButtonParameters): {
  pointerHandlers: {
    onTouchStart: React.TouchEventHandler<HTMLElement>;
    onTouchEnd: React.TouchEventHandler<HTMLElement>;
    onPointerDown: React.PointerEventHandler<HTMLElement>;
    onPointerUp: React.PointerEventHandler<HTMLElement>;
    onPointerMove: React.PointerEventHandler<HTMLElement>;
    onMouseEnter: React.MouseEventHandler<HTMLElement>;
    onMouseLeave: React.MouseEventHandler<HTMLElement>;
    onMouseUp: React.MouseEventHandler<HTMLElement>;
  };
  autoChangeButtonRef: React.RefObject<HTMLElement | null>;
  shouldSkipClick: (event: React.MouseEvent) => boolean;
};
export {};