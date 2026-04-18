"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useCalendarContext = useCalendarContext;
var React = _interopRequireWildcard(require("react"));
var _store = require("@base-ui/utils/store");
var _SharedCalendarRootContext = require("../root/SharedCalendarRootContext");
var _store2 = require("../store");
function useCalendarContext() {
  const store = (0, _SharedCalendarRootContext.useSharedCalendarRootContext)();
  const calendarPublicContext = (0, _store.useStore)(store, _store2.selectors.publicContext);
  return React.useMemo(() => ({
    ...calendarPublicContext,
    setVisibleDate: store.setVisibleDate
  }), [calendarPublicContext, store.setVisibleDate]);
}