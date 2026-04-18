import { useSharedCalendarRootContext } from "../root/SharedCalendarRootContext.js";
import { selectors } from "../store/index.js";
export type CalendarContext = ReturnType<typeof selectors.publicContext> & {
  setVisibleDate: ReturnType<typeof useSharedCalendarRootContext>['setVisibleDate'];
};
export declare function useCalendarContext(): CalendarContext;