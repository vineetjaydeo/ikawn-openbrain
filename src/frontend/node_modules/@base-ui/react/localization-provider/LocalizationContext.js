"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LocalizationContext = void 0;
exports.useTemporalLocale = useTemporalLocale;
var _formatErrorMessage2 = _interopRequireDefault(require("@base-ui/utils/formatErrorMessage"));
var React = _interopRequireWildcard(require("react"));
/**
 * @internal
 */
const LocalizationContext = exports.LocalizationContext = /*#__PURE__*/React.createContext(undefined);
if (process.env.NODE_ENV !== "production") LocalizationContext.displayName = "LocalizationContext";
function useTemporalLocale() {
  const context = React.useContext(LocalizationContext);
  if (context === undefined) {
    throw new Error(process.env.NODE_ENV !== "production" ? 'Base UI: LocalizationContext is missing. Temporal components must be place within <LocalizationProvider />' : (0, _formatErrorMessage2.default)(94));
  }
  return context.temporalLocale;
}