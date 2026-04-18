"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.areDatesEqual = areDatesEqual;
exports.formatMonthFullLetterAndYear = formatMonthFullLetterAndYear;
exports.isAfterDay = isAfterDay;
exports.isBeforeDay = isBeforeDay;
exports.mergeDateAndTime = mergeDateAndTime;
exports.replaceInvalidDateByNull = replaceInvalidDateByNull;
function mergeDateAndTime(adapter, dateParam, timeParam) {
  let mergedDate = dateParam;
  mergedDate = adapter.setHours(mergedDate, adapter.getHours(timeParam));
  mergedDate = adapter.setMinutes(mergedDate, adapter.getMinutes(timeParam));
  mergedDate = adapter.setSeconds(mergedDate, adapter.getSeconds(timeParam));
  mergedDate = adapter.setMilliseconds(mergedDate, adapter.getMilliseconds(timeParam));
  return mergedDate;
}
function areDatesEqual(adapter, a, b) {
  if (!adapter.isValid(a) && a != null && !adapter.isValid(b) && b != null) {
    return true;
  }
  return adapter.isEqual(a, b);
}
function replaceInvalidDateByNull(adapter, value) {
  if (adapter.isValid(value)) {
    return value;
  }
  return null;
}

/**
 * Check if the day of the date A is after the day of the date B.
 * Uses timezone of the date A.
 */
function isAfterDay(adapter, dateA, dateB) {
  const dateBWithCorrectTimezone = adapter.setTimezone(dateB, adapter.getTimezone(dateA));
  return adapter.isAfter(dateA, adapter.endOfDay(dateBWithCorrectTimezone));
}

/**
 * Check if the day of the date A is before the day of the date B.
 * Uses timezone of the date A.
 */
function isBeforeDay(adapter, dateA, dateB) {
  const dateBWithCorrectTimezone = adapter.setTimezone(dateB, adapter.getTimezone(dateA));
  return adapter.isBefore(dateA, adapter.startOfDay(dateBWithCorrectTimezone));
}
function formatMonthFullLetterAndYear(adapter, date) {
  const f = adapter.formats;
  const dateFormat = `${f.monthFullLetter} ${f.yearPadded}`;
  return adapter.formatByString(date, dateFormat);
}