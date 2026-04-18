"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useCalendarWeekList = useCalendarWeekList;
var React = _interopRequireWildcard(require("react"));
var _TemporalAdapterContext = require("../../temporal-adapter-provider/TemporalAdapterContext");
var _getWeekList = require("./getWeekList");
function useCalendarWeekList() {
  const adapter = (0, _TemporalAdapterContext.useTemporalAdapter)();
  return React.useCallback(params => (0, _getWeekList.getWeekList)(adapter, params), [adapter]);
}