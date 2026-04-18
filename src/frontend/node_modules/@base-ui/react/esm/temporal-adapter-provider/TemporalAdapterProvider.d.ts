import * as React from 'react';
import { TemporalAdapter } from "../types/temporal/index.js";
/**
 * Defines the date library adapter for Base UI temporal components.
 */
export declare const TemporalAdapterProvider: React.FC<TemporalAdapterProvider.Props>;
export declare namespace TemporalAdapterProvider {
  interface Props {
    children?: React.ReactNode;
    /**
     * The date library adapter.
     */
    adapter: TemporalAdapter;
  }
}