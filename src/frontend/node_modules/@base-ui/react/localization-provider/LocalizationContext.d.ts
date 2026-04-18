import * as React from 'react';
import { Locale } from 'date-fns/locale';
export type LocalizationContext = {
  temporalLocale?: Locale | undefined;
};
/**
 * @internal
 */
export declare const LocalizationContext: React.Context<LocalizationContext | undefined>;
export declare function useTemporalLocale(): Locale | undefined;