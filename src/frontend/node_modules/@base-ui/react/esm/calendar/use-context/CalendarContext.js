'use client';

import * as React from 'react';
import { useStore } from '@base-ui/utils/store';
import { useSharedCalendarRootContext } from "../root/SharedCalendarRootContext.js";
import { selectors } from "../store/index.js";
export function useCalendarContext() {
  const store = useSharedCalendarRootContext();
  const calendarPublicContext = useStore(store, selectors.publicContext);
  return React.useMemo(() => ({
    ...calendarPublicContext,
    setVisibleDate: store.setVisibleDate
  }), [calendarPublicContext, store.setVisibleDate]);
}