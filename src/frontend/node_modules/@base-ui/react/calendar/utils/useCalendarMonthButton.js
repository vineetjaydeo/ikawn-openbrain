"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useCalendarMonthButton = useCalendarMonthButton;
var React = _interopRequireWildcard(require("react"));
var _usePressAndHold = require("../../utils/usePressAndHold");
var _reasons = require("../../utils/reasons");
var _store = require("../store");
const CHANGE_MONTH_TICK_DELAY = 100;
/**
 * Adds press-and-hold behavior to Calendar month navigation buttons.
 * On pointer down, performs one navigation immediately, then after a delay
 * starts continuous navigation at a fixed interval.
 */
function useCalendarMonthButton(params) {
  const {
    direction,
    disabled,
    disabledProp,
    store,
    adapter,
    monthPageSize
  } = params;
  const autoChangeButtonRef = React.useRef(null);
  const {
    pointerHandlers,
    shouldSkipClick
  } = (0, _usePressAndHold.usePressAndHold)({
    disabled,
    elementRef: autoChangeButtonRef,
    tickDelay: CHANGE_MONTH_TICK_DELAY,
    tick(triggerNativeEvent) {
      const button = autoChangeButtonRef.current;
      const currentVisibleDate = _store.selectors.visibleDate(store.state);
      const targetDate = adapter.addMonths(currentVisibleDate, direction * monthPageSize);
      const wouldBeDisabled = _store.selectors.isSetMonthButtonDisabled(store.state, targetDate, disabledProp);
      if (wouldBeDisabled) {
        return false;
      }
      store.setVisibleDate(targetDate, triggerNativeEvent, button ?? undefined, _reasons.REASONS.monthChange);
      return true;
    }
  });
  return {
    pointerHandlers,
    autoChangeButtonRef,
    shouldSkipClick
  };
}