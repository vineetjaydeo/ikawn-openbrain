import { isAfterDay, isBeforeDay } from "./date-helpers.js";
export function getInitialReferenceDate(parameters) {
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
    if (minDate != null && isBeforeDay(adapter, referenceDate, minDate)) {
      referenceDate = minDate;
    }
    if (maxDate != null && isAfterDay(adapter, referenceDate, maxDate)) {
      referenceDate = maxDate;
    }
  }
  return adapter.setTimezone(referenceDate, timezone);
}