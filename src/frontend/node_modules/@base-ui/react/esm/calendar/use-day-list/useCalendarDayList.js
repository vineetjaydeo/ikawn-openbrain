import * as React from 'react';
import { useTemporalAdapter } from "../../temporal-adapter-provider/TemporalAdapterContext.js";
import { getDayList } from "./getDayList.js";
export function useCalendarDayList() {
  const adapter = useTemporalAdapter();
  return React.useCallback(params => getDayList(adapter, params), [adapter]);
}