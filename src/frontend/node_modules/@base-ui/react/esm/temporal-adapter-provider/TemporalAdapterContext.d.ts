import * as React from 'react';
import { TemporalAdapter } from "../types/temporal/index.js";
export type TemporalAdapterContext = {
  adapter: TemporalAdapter;
};
/**
 * @internal
 */
export declare const TemporalAdapterContext: React.Context<TemporalAdapterContext | undefined>;
export declare function useTemporalAdapter(): TemporalAdapter;