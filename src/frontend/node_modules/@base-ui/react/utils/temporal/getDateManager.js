"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getDateManager = getDateManager;
var _dateHelpers = require("./date-helpers");
var _validateDate = require("./validateDate");
function getDateManager(adapter) {
  return {
    emptyValue: null,
    emptyValidationError: null,
    areValuesEqual: (valueA, valueB) => (0, _dateHelpers.areDatesEqual)(adapter, valueA, valueB),
    getValidationError: (value, validationProps) => (0, _validateDate.validateDate)({
      adapter,
      value,
      validationProps
    }),
    areValidationErrorEquals: (errorA, errorB) => errorA === errorB,
    isValidationErrorEmpty: error => error == null,
    getTimezone: value => adapter.isValid(value) ? adapter.getTimezone(value) : null,
    setTimezone: (value, timezone) => value == null ? null : adapter.setTimezone(value, timezone),
    getDatesFromValue: value => value == null ? [] : [value]
  };
}