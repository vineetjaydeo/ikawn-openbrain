import * as React from 'react';
import { useTemporalAdapter } from "../../temporal-adapter-provider/TemporalAdapterContext.js";
import { getWeekList } from "./getWeekList.js";
export function useCalendarWeekList() {
  const adapter = useTemporalAdapter();
  return React.useCallback(params => getWeekList(adapter, params), [adapter]);
}