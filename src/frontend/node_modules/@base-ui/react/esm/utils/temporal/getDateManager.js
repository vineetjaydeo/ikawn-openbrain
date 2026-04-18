import { areDatesEqual } from "./date-helpers.js";
import { validateDate } from "./validateDate.js";
export function getDateManager(adapter) {
  return {
    emptyValue: null,
    emptyValidationError: null,
    areValuesEqual: (valueA, valueB) => areDatesEqual(adapter, valueA, valueB),
    getValidationError: (value, validationProps) => validateDate({
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