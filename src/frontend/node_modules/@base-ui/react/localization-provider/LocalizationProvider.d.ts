import * as React from 'react';
import { Locale } from 'date-fns/locale';
/**
 * Defines the temporal locale provider for Base UI temporal components.
 *
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Localization Provider](https://base-ui.com/react/utils/localization-provider)
 */
export declare const LocalizationProvider: React.FC<LocalizationProvider.Props>;
export declare namespace LocalizationProvider {
  interface Props {
    children?: React.ReactNode;
    /**
     * The locale to use in temporal components.
     * @default en-US
     */
    temporalLocale?: Locale | undefined;
  }
}