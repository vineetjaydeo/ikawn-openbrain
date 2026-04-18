export function mergeDateAndTime(adapter, dateParam, timeParam) {
  let mergedDate = dateParam;
  mergedDate = adapter.setHours(mergedDate, adapter.getHours(timeParam));
  mergedDate = adapter.setMinutes(mergedDate, adapter.getMinutes(timeParam));
  mergedDate = adapter.setSeconds(mergedDate, adapter.getSeconds(timeParam));
  mergedDate = adapter.setMilliseconds(mergedDate, adapter.getMilliseconds(timeParam));
  return mergedDate;
}
export function areDatesEqual(adapter, a, b) {
  if (!adapter.isValid(a) && a != null && !adapter.isValid(b) && b != null) {
    return true;
  }
  return adapter.isEqual(a, b);
}
export function replaceInvalidDateByNull(adapter, value) {
  if (adapter.isValid(value)) {
    return value;
  }
  return null;
}

/**
 * Check if the day of the date A is after the day of the date B.
 * Uses timezone of the date A.
 */
export function isAfterDay(adapter, dateA, dateB) {
  const dateBWithCorrectTimezone = adapter.setTimezone(dateB, adapter.getTimezone(dateA));
  return adapter.isAfter(dateA, adapter.endOfDay(dateBWithCorrectTimezone));
}

/**
 * Check if the day of the date A is before the day of the date B.
 * Uses timezone of the date A.
 */
export function isBeforeDay(adapter, dateA, dateB) {
  const dateBWithCorrectTimezone = adapter.setTimezone(dateB, adapter.getTimezone(dateA));
  return adapter.isBefore(dateA, adapter.startOfDay(dateBWithCorrectTimezone));
}
export function formatMonthFullLetterAndYear(adapter, date) {
  const f = adapter.formats;
  const dateFormat = `${f.monthFullLetter} ${f.yearPadded}`;
  return adapter.formatByString(date, dateFormat);
}