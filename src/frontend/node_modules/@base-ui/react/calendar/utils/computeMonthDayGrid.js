"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.computeMonthDayGrid = computeMonthDayGrid;
var _getDayList = require("../use-day-list/getDayList");
var _getWeekList = require("../use-week-list/getWeekList");
/**
 * Computes a flat, chronologically ordered array of all days in a month's grid.
 * Composes `getWeekList` and `getDayList` to produce the same result as the rendered grid.
 */
function computeMonthDayGrid(adapter, month, fixedWeekNumber, weeks) {
  const weeksList = weeks ?? (0, _getWeekList.getWeekList)(adapter, {
    date: month,
    amount: fixedWeekNumber ?? 'end-of-month'
  });
  return weeksList.flatMap(week => (0, _getDayList.getDayList)(adapter, {
    date: week,
    amount: 7
  }));
}