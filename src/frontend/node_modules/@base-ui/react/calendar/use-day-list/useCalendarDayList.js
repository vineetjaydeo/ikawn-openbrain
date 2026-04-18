"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useCalendarDayList = useCalendarDayList;
var React = _interopRequireWildcard(require("react"));
var _TemporalAdapterContext = require("../../temporal-adapter-provider/TemporalAdapterContext");
var _getDayList = require("./getDayList");
function useCalendarDayList() {
  const adapter = (0, _TemporalAdapterContext.useTemporalAdapter)();
  return React.useCallback(params => (0, _getDayList.getDayList)(adapter, params), [adapter]);
}