import { ReactStore } from '@base-ui/utils/store';
import { getInitialReferenceDate } from "../../utils/temporal/getInitialReferenceDate.js";
import { createChangeEventDetails } from "../../utils/createBaseUIEventDetails.js";
import { mergeDateAndTime } from "../../utils/temporal/date-helpers.js";
import { selectors } from "./selectors.js";
import { REASONS } from "../../utils/reasons.js";
/**
 * Store managing the state of the Calendar and the Range Calendar components.
 */
export class SharedCalendarStore extends ReactStore {
  constructor(parameters, adapter, manager, valueManager) {
    const value = parameters.value ?? parameters.defaultValue ?? manager.emptyValue;
    const initialReferenceDateFromValue = valueManager.getDateToUseForReferenceDate(value);
    let initialVisibleDate;
    if (parameters.visibleDate) {
      initialVisibleDate = parameters.visibleDate;
    } else if (parameters.defaultVisibleDate) {
      initialVisibleDate = parameters.defaultVisibleDate;
    } else {
      initialVisibleDate = getInitialReferenceDate({
        adapter,
        timezone: parameters.timezone ?? 'default',
        validationProps: {
          minDate: parameters.minDate,
          maxDate: parameters.maxDate
        },
        externalReferenceDate: parameters.referenceDate ?? null,
        externalDate: initialReferenceDateFromValue
      });
    }
    super({
      adapter,
      manager,
      timezoneProp: parameters.timezone,
      referenceDateProp: parameters.referenceDate ?? null,
      minDate: parameters.minDate,
      maxDate: parameters.maxDate,
      isDateUnavailable: parameters.isDateUnavailable,
      disabled: parameters.disabled ?? false,
      readOnly: parameters.readOnly ?? false,
      invalidProp: parameters.invalid,
      monthPageSize: parameters.monthPageSize ?? 1,
      visibleDate: initialVisibleDate,
      visibleDateProp: parameters.visibleDate,
      initialReferenceDateFromValue,
      value,
      valueProp: parameters.value,
      navigationDirection: 'none'
    }, {
      onValueChange: parameters.onValueChange,
      onVisibleDateChange: parameters.onVisibleDateChange
    });
    this.valueManager = valueManager;

    // When the controlled value prop changes, sync the internal value
    // and auto-update visibleDate to the active date.
    this.observe(state => state.valueProp, (newValueProp, oldValueProp) => {
      if (newValueProp !== undefined && oldValueProp !== undefined && !this.state.adapter.isEqual(newValueProp, oldValueProp)) {
        this.set('value', newValueProp);
        const visibleDate = this.valueManager.getActiveDateFromValue(newValueProp);
        if (this.state.adapter.isValid(visibleDate) && !this.state.adapter.isSameMonth(visibleDate, this.state.visibleDate)) {
          this.setVisibleDate(visibleDate, undefined, undefined, REASONS.valuePropChange);
        }
      }
    });

    // When the controlled visible date prop changes, update the navigation direction.
    this.observe(state => state.visibleDateProp, (newVisibleDateProp, oldVisibleDateProp) => {
      if (newVisibleDateProp !== undefined && oldVisibleDateProp !== undefined && !this.state.adapter.isEqual(newVisibleDateProp, oldVisibleDateProp)) {
        this.set('navigationDirection', this.getNavigationDirectionFromVisibleDateChange(newVisibleDateProp, oldVisibleDateProp));
      }
    });
  }

  /**
   * Sets the visible date.
   */
  setVisibleDate = (visibleDate, nativeEvent, trigger, reason) => {
    const eventDetails = createChangeEventDetails(reason ?? REASONS.dayPress, nativeEvent, trigger);
    this.context.onVisibleDateChange?.(visibleDate, eventDetails);
    if (!eventDetails.isCanceled && this.state.visibleDateProp === undefined) {
      this.update({
        visibleDate,
        navigationDirection: this.getNavigationDirectionFromVisibleDateChange(visibleDate, this.state.visibleDate)
      });
    }
  };

  /**
   * Selects a date.
   */
  selectDate = (selectedDate, event) => {
    if (this.state.readOnly) {
      return;
    }
    const referenceDate = selectors.referenceDate(this.state);
    const activeDate = this.valueManager.getActiveDateFromValue(this.state.value) ?? referenceDate;
    const cleanSelectedDate = mergeDateAndTime(this.state.adapter, selectedDate, activeDate);
    this.valueManager.onSelectDate({
      setValue: newValue => this.setValue(newValue, event),
      prevValue: this.state.value,
      selectedDate: cleanSelectedDate,
      referenceDate
    });
  };

  /**
   * Sets the value.
   * Should only be used internally through `selectDate` method.
   */
  setValue(newValue, event) {
    const inputTimezone = this.state.manager.getTimezone(this.state.value);
    const newValueWithInputTimezone = inputTimezone == null ? newValue : this.state.manager.setTimezone(newValue, inputTimezone);
    const eventDetails = createChangeEventDetails(REASONS.dayPress, event.nativeEvent, event.currentTarget, {
      getValidationError: () => this.state.manager.getValidationError(newValueWithInputTimezone, selectors.validationProps(this.state))
    });
    this.context.onValueChange?.(newValueWithInputTimezone, eventDetails);
    if (!eventDetails.isCanceled && this.state.valueProp === undefined) {
      this.set('value', newValueWithInputTimezone);
    }
  }

  /**
   * Determines the navigation direction based on the new and the previous visible date.
   */
  getNavigationDirectionFromVisibleDateChange(visibleDate, previousVisibleDate) {
    const prevVisibleDateTimestamp = this.state.adapter.getTime(previousVisibleDate);
    const visibleDateTimestamp = this.state.adapter.getTime(visibleDate);
    let newNavigationDirection = 'none';
    if (visibleDateTimestamp < prevVisibleDateTimestamp) {
      newNavigationDirection = 'previous';
    } else if (visibleDateTimestamp > prevVisibleDateTimestamp) {
      newNavigationDirection = 'next';
    }
    return newNavigationDirection;
  }
}