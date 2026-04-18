import { isAfterDay, isBeforeDay } from "./date-helpers.js";
export function validateDate(parameters) {
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
  if (minDate != null && isBeforeDay(adapter, value, minDate)) {
    return 'before-min-date';
  }
  if (maxDate != null && isAfterDay(adapter, value, maxDate)) {
    return 'after-max-date';
  }
  return null;
}