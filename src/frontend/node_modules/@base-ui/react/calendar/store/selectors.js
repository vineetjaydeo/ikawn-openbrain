"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.selectors = void 0;
var _store = require("@base-ui/utils/store");
var _getInitialReferenceDate = require("../../utils/temporal/getInitialReferenceDate");
var _validateDate = require("../../utils/temporal/validateDate");
const timezoneToRenderSelector = (0, _store.createSelectorMemoized)(state => state.adapter, state => state.manager, state => state.value, state => state.timezoneProp, state => state.referenceDateProp, (adapter, manager, value, timezoneProp, referenceDateProp) => {
  if (timezoneProp != null) {
    return timezoneProp;
  }
  const valueTimezone = manager.getTimezone(value);
  if (valueTimezone) {
    return valueTimezone;
  }
  if (referenceDateProp) {
    return adapter.getTimezone(referenceDateProp);
  }
  return 'default';
});
const validationPropsSelector = (0, _store.createSelectorMemoized)(state => state.minDate, state => state.maxDate, (minDate, maxDate) => ({
  minDate,
  maxDate
}));
const referenceDateSelector = (0, _store.createSelectorMemoized)(state => state.adapter, timezoneToRenderSelector, state => state.initialReferenceDateFromValue, validationPropsSelector, state => state.referenceDateProp, (adapter, timezone, initialReferenceDateFromValue, validationProps, referenceDateProp) => (0, _getInitialReferenceDate.getInitialReferenceDate)({
  adapter,
  timezone,
  validationProps,
  externalReferenceDate: referenceDateProp,
  externalDate: initialReferenceDateFromValue
}));
const valueWithTimezoneToRenderSelector = (0, _store.createSelectorMemoized)(timezoneToRenderSelector, state => state.manager, state => state.value, (timezone, manager, value) => manager.setTimezone(value, timezone));
const selectedDatesSelector = (0, _store.createSelectorMemoized)(state => state.manager, state => state.value, timezoneToRenderSelector, (manager, value, timezone) => manager.getDatesFromValue(value).map(date => {
  if (manager.getTimezone(date) === timezone) {
    return date;
  }
  return manager.setTimezone(date, timezone);
}));
const isDayCellDisabledSelector = (0, _store.createSelector)((state, value) => {
  if (state.disabled) {
    return true;
  }
  const validationError = (0, _validateDate.validateDate)({
    adapter: state.adapter,
    value,
    validationProps: validationPropsSelector(state)
  });
  return validationError != null;
});
const isDayCellUnavailableSelector = (0, _store.createSelector)((state, value) => state.isDateUnavailable?.(value) ?? false);
const isDayButtonSelectedSelector = (0, _store.createSelector)(state => state.adapter, selectedDatesSelector, (adapter, selectedDates, cellValue) => {
  return selectedDates.some(date => adapter.isSameDay(cellValue, date));
});
const isSetMonthButtonDisabledSelector = (0, _store.createSelector)(state => state.adapter, validationPropsSelector, state => state.disabled, (adapter, validationProps, isCalendarDisabled, targetDate, disabledProp) => {
  // short-circuit if the disabled prop is explicitly provided.
  if (disabledProp !== undefined) {
    return disabledProp;
  }
  if (isCalendarDisabled) {
    return true;
  }

  // The month targeted and all the months before are fully disabled, we disable the button.
  if (validationProps.minDate != null && adapter.isBefore(adapter.endOfMonth(targetDate), validationProps.minDate)) {
    return true;
  }

  // The month targeted and all the months after are fully disabled, we disable the button.
  return validationProps.maxDate != null && adapter.isAfter(adapter.startOfMonth(targetDate), validationProps.maxDate);
});
const visibleDateSelector = (0, _store.createSelectorMemoized)(state => state.visibleDateProp, state => state.visibleDate, state => state.adapter, timezoneToRenderSelector, (visibleDateProp, visibleDate, adapter, timezone) => adapter.setTimezone(visibleDateProp ?? visibleDate, timezone));
const visibleMonthSelector = (0, _store.createSelectorMemoized)(state => state.adapter, visibleDateSelector, (adapter, date) => adapter.startOfMonth(date));
const isValueInvalidSelector = (0, _store.createSelectorMemoized)(state => state.manager, state => state.invalidProp, valueWithTimezoneToRenderSelector, validationPropsSelector, (manager, invalidProp, value, validationProps) => {
  if (invalidProp != null) {
    return invalidProp;
  }
  const error = manager.getValidationError(value, validationProps);
  return !manager.isValidationErrorEmpty(error);
});
const rootElementStateSelector = (0, _store.createSelectorMemoized)(state => state.manager, state => state.readOnly, state => state.disabled, state => state.navigationDirection, isValueInvalidSelector, valueWithTimezoneToRenderSelector, (manager, readOnly, disabled, navigationDirection, invalid, value) => ({
  empty: manager.areValuesEqual(value, manager.emptyValue),
  invalid,
  disabled,
  readOnly,
  navigationDirection
}));
const publicContextSelector = (0, _store.createSelectorMemoized)(visibleDateSelector, visibleDate => ({
  visibleDate
}));
const getMonthKey = (adapter, date) => `${adapter.getYear(date)}-${adapter.getMonth(date)}`;
const getDateKey = (adapter, date) => adapter.getTime(date);
const tabbableCellsPerMonthSelector = (0, _store.createSelectorMemoized)(state => state.adapter, selectedDatesSelector, referenceDateSelector, (adapter, selectedDates, referenceDate) => {
  const months = new Map();

  // Each month that contains selected dates has these selected dates as tabbable cells.
  for (const date of selectedDates) {
    const monthKey = getMonthKey(adapter, date);
    if (!months.has(monthKey)) {
      months.set(monthKey, new Set());
    }
    months.get(monthKey).add(getDateKey(adapter, date));
  }

  // If the month containing the reference dates has no selected dates, then the reference date will be tabbable in this month.
  const referenceDateMonthKey = getMonthKey(adapter, referenceDate);
  if (!months.has(referenceDateMonthKey)) {
    months.set(referenceDateMonthKey, new Set([getDateKey(adapter, referenceDate)]));
  }
  return months;
});
const isDayButtonTabbableSelector = (0, _store.createSelector)(tabbableCellsPerMonthSelector, state => state.adapter, (tabbableCellsPerMonth, adapter, date, month) => {
  // If the date is not in the current month, it cannot be tabbable.
  if (!adapter.isSameMonth(date, month)) {
    return false;
  }
  const monthKey = getMonthKey(adapter, date);

  // If the month has registered tabbable cells, we check if the date is one of them.
  if (tabbableCellsPerMonth.has(monthKey)) {
    const dateKey = getDateKey(adapter, date);
    return tabbableCellsPerMonth.get(monthKey).has(dateKey);
  }

  // Otherwise, only the first day of the month is tabbable.
  const firstDayOfMonth = adapter.startOfMonth(date);
  return adapter.isSameDay(date, firstDayOfMonth);
});
const selectors = exports.selectors = {
  /**
   * Returns the timezone to use for rendering.
   */
  timezoneToRender: timezoneToRenderSelector,
  /**
   * Returns the state of the root element.
   */
  rootElementState: rootElementStateSelector,
  /**
   * Returns the context to publicly expose in render functions and hooks.
   */
  publicContext: publicContextSelector,
  /**
   * Returns the props to check if a date is valid or not.
   */
  validationProps: validationPropsSelector,
  /**
   * Returns the amount of months to navigate by when pressing `<Calendar.IncrementMonth>` or `<Calendar.DecrementMonth>`.
   */
  monthPageSize: (0, _store.createSelector)(state => state.monthPageSize),
  /**
   * Returns the date currently visible.
   */
  visibleDate: visibleDateSelector,
  /**
   * Returns the current visible month.
   */
  visibleMonth: visibleMonthSelector,
  /**
   * Returns the navigation direction.
   */
  navigationDirection: (0, _store.createSelector)(state => state.navigationDirection),
  /**
   * Returns the current value with the timezone to render applied.
   */
  valueWithTimezoneToRender: valueWithTimezoneToRenderSelector,
  /**
   * Returns the reference date.
   */
  referenceDate: referenceDateSelector,
  /**
   * Returns the list of currently selected dates.
   * When used inside the Calendar component, it contains the current value if not null.
   * When used inside the RangeCalendar component, it contains the selected start and/or end dates if not null.
   */
  selectedDates: selectedDatesSelector,
  /**
   * Checks if a day cell should be disabled.
   */
  isDayCellDisabled: isDayCellDisabledSelector,
  /**
   * Checks if a day cell should be selected.
   */
  isDayButtonSelected: isDayButtonSelectedSelector,
  /**
   * Checks if a specific dates is unavailable.
   * If so, this date should not be selectable but should still be focusable with the keyboard.
   */
  isDayCellUnavailable: isDayCellUnavailableSelector,
  /**
   * Checks if a month navigation button should be disabled.
   */
  isSetMonthButtonDisabled: isSetMonthButtonDisabledSelector,
  /**
   * Checks if a day should be reachable using tab navigation.
   */
  isDayButtonTabbable: isDayButtonTabbableSelector
};