import { TemporalAdapter, TemporalValue, TemporalSupportedObject } from "../../types/temporal/index.js";
export declare function validateDate(parameters: ValidateDateParameters): ValidateDateReturnValue;
export interface ValidateDateParameters {
  /**
   * The adapter used to manipulate the date.
   */
  adapter: TemporalAdapter;
  /**
   * The value to validate.
   */
  value: TemporalValue;
  /**
   * The props used to validate a date.
   */
  validationProps: ValidateDateValidationProps;
}
export interface ValidateDateValidationProps {
  /**
   * Minimal selectable date.
   */
  minDate?: TemporalSupportedObject | undefined;
  /**
   * Maximal selectable date.
   */
  maxDate?: TemporalSupportedObject | undefined;
}
export type ValidateDateReturnValue = 'invalid' | 'before-min-date' | 'after-max-date' | null;