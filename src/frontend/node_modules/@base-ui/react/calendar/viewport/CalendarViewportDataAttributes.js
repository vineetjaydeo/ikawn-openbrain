"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarViewportDataAttributes = void 0;
var _stateAttributesMapping = require("../../utils/stateAttributesMapping");
let CalendarViewportDataAttributes = exports.CalendarViewportDataAttributes = function (CalendarViewportDataAttributes) {
  /**
   * Applied to the direct child of the viewport when no transitions are present or the new content when it's entering.
   */
  CalendarViewportDataAttributes["current"] = "data-current";
  /**
   * Applied to the direct child of the viewport that contains the exiting content when transitions are present.
   */
  CalendarViewportDataAttributes["previous"] = "data-previous";
  /**
   * Indicates the direction of the navigation (based on the month navigating to).
   * @type {'previous' | 'next' | 'none'}
   */
  CalendarViewportDataAttributes["navigationDirection"] = "data-navigation-direction";
  /**
   * Present when the day grid body is animating in.
   */
  CalendarViewportDataAttributes[CalendarViewportDataAttributes["startingStyle"] = _stateAttributesMapping.TransitionStatusDataAttributes.startingStyle] = "startingStyle";
  /**
   * Present when the day grid body is animating out.
   */
  CalendarViewportDataAttributes[CalendarViewportDataAttributes["endingStyle"] = _stateAttributesMapping.TransitionStatusDataAttributes.endingStyle] = "endingStyle";
  return CalendarViewportDataAttributes;
}({});