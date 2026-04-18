"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.enqueueFocus = enqueueFocus;
var _noop = require("../../utils/noop");
let rafId = 0;
function enqueueFocus(el, options = {}) {
  const {
    preventScroll = false,
    cancelPrevious = true,
    sync = false
  } = options;
  if (cancelPrevious) {
    cancelAnimationFrame(rafId);
  }
  const exec = () => el?.focus({
    preventScroll
  });
  if (sync) {
    exec();
    return _noop.NOOP;
  }
  const currentRafId = requestAnimationFrame(exec);
  rafId = currentRafId;
  return () => {
    if (rafId === currentRafId) {
      cancelAnimationFrame(currentRafId);
      rafId = 0;
    }
  };
}