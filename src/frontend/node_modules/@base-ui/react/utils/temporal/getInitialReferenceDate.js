"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getInitialReferenceDate = getInitialReferenceDate;
var _dateHelpers = require("./date-helpers");
function getInitialReferenceDate(parameters) {
  const {
    adapter,
    timezone,
    externalDate,
    externalReferenceDate,
    validationProps: {
      minDate,
      maxDate
    }
  } = parameters;
  let referenceDate = null;
  if (adapter.isValid(externalDate)) {
    referenceDate = externalDate;
  } else if (adapter.isValid(externalReferenceDate)) {
    referenceDate = externalReferenceDate;
  } else {
    referenceDate = adapter.startOfDay(adapter.now(timezone));
    if (minDate != null && (0, _dateHelpers.isBeforeDay)(adapter, referenceDate, minDate)) {
      referenceDate = minDate;
    }
    if (maxDate != null && (0, _dateHelpers.isAfterDay)(adapter, referenceDate, maxDate)) {
      referenceDate = maxDate;
    }
  }
  return adapter.setTimezone(referenceDate, timezone);
}