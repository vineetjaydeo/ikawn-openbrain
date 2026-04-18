import * as React from 'react';
import { SharedCalendarStore } from "../store/index.js";
export type SharedCalendarRootContext = SharedCalendarStore<any, any>;
export declare const SharedCalendarRootContext: React.Context<SharedCalendarRootContext | undefined>;
export declare function useSharedCalendarRootContext(): SharedCalendarRootContext;