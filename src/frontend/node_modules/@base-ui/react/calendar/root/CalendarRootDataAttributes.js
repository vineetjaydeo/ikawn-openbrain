"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarRootDataAttributes = void 0;
let CalendarRootDataAttributes = exports.CalendarRootDataAttributes = /*#__PURE__*/function (CalendarRootDataAttributes) {
  /**
   * Present when the current value is empty.
   */
  CalendarRootDataAttributes["empty"] = "data-empty";
  /**
   * Present when the current value is invalid (fails validation).
   */
  CalendarRootDataAttributes["invalid"] = "data-invalid";
  /**
   * Present when the calendar is disabled.
   */
  CalendarRootDataAttributes["disabled"] = "data-disabled";
  /**
   * Present when the calendar is readonly.
   */
  CalendarRootDataAttributes["readonly"] = "data-readonly";
  /**
   * Indicates the direction of the navigation (based on the month navigating to).
   * @type {'previous' | 'next' | 'none'}
   */
  CalendarRootDataAttributes["navigationDirection"] = "data-navigation-direction";
  return CalendarRootDataAttributes;
}({});