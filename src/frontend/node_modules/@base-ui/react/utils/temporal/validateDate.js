"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.validateDate = validateDate;
var _dateHelpers = require("./date-helpers");
function validateDate(parameters) {
  const {
    adapter,
    value,
    validationProps
  } = parameters;
  if (value === null) {
    return null;
  }
  const {
    minDate,
    maxDate
  } = validationProps;
  if (!adapter.isValid(value)) {
    return 'invalid';
  }
  if (minDate != null && (0, _dateHelpers.isBeforeDay)(adapter, value, minDate)) {
    return 'before-min-date';
  }
  if (maxDate != null && (0, _dateHelpers.isAfterDay)(adapter, value, maxDate)) {
    return 'after-max-date';
  }
  return null;
}