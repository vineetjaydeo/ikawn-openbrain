import * as React from 'react';
import { useStore } from '@base-ui/utils/store';
import { useTemporalAdapter } from "../../temporal-adapter-provider/TemporalAdapterContext.js";
import { useSharedCalendarDayGridBodyContext } from "../day-grid-body/SharedCalendarDayGridBodyContext.js";
import { useSharedCalendarRootContext } from "../root/SharedCalendarRootContext.js";
import { selectors } from "../store/index.js";
export function useSharedCalendarDayGridCell(parameters) {
  const {
    value
  } = parameters;
  const adapter = useTemporalAdapter();
  const store = useSharedCalendarRootContext();
  const {
    month
  } = useSharedCalendarDayGridBodyContext();
  const isDisabled = useStore(store, selectors.isDayCellDisabled, value);
  const isUnavailable = useStore(store, selectors.isDayCellUnavailable, value);
  const isOutsideCurrentMonth = React.useMemo(() => month == null ? false : !adapter.isSameMonth(month, value), [month, value, adapter]);
  const props = {
    role: 'gridcell',
    'aria-disabled': isDisabled || isOutsideCurrentMonth || isUnavailable ? true : undefined
  };
  const context = React.useMemo(() => ({
    value,
    isDisabled,
    isUnavailable,
    isOutsideCurrentMonth
  }), [isDisabled, isUnavailable, isOutsideCurrentMonth, value]);
  return {
    props,
    context
  };
}