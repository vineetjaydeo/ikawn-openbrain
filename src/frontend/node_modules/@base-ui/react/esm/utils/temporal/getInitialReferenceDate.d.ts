import { TemporalAdapter, TemporalTimezone, TemporalSupportedObject } from "../../types/temporal/index.js";
import { ValidateDateValidationProps } from "./validateDate.js";
export declare function getInitialReferenceDate(parameters: GetInitialReferenceDateParameters): TemporalSupportedObject;
export interface GetInitialReferenceDateParameters {
  /**
   * The adapter used to manipulate the date.
   */
  adapter: TemporalAdapter;
  /**
   * The date provided by the user, if any.
   * If the component is a range component, this will be the start date if defined or the end date otherwise.
   */
  externalDate: TemporalSupportedObject | null;
  /**
   * The reference date provided by the user, if any.
   */
  externalReferenceDate: TemporalSupportedObject | null;
  /**
   * The timezone the reference date should be in.
   */
  timezone: TemporalTimezone;
  /**
   * The props used to validate the date, time or date-time object.
   */
  validationProps: GetInitialReferenceDateValidationProps;
}
export interface GetInitialReferenceDateValidationProps extends ValidateDateValidationProps {}