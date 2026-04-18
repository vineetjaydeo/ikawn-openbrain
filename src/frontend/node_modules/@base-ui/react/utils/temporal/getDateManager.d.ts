import { ValidateDateReturnValue, ValidateDateValidationProps } from "./validateDate.js";
import { TemporalManager } from "./types.js";
import { TemporalValue, TemporalAdapter } from "../../types/temporal/index.js";
export declare function getDateManager(adapter: TemporalAdapter): GetDateManagerReturnValue;
export type GetDateManagerReturnValue = TemporalManager<TemporalValue, ValidateDateReturnValue, ValidateDateValidationProps>;