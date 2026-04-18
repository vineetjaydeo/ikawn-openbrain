"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useSharedCalendarDayGridBody = useSharedCalendarDayGridBody;
var React = _interopRequireWildcard(require("react"));
var _store = require("@base-ui/utils/store");
var _useIsoLayoutEffect = require("@base-ui/utils/useIsoLayoutEffect");
var _reasons = require("../../utils/reasons");
var _SharedCalendarRootContext = require("../root/SharedCalendarRootContext");
var _TemporalAdapterContext = require("../../temporal-adapter-provider/TemporalAdapterContext");
var _useCalendarWeekList = require("../use-week-list/useCalendarWeekList");
var _store2 = require("../store");
var _computeMonthDayGrid = require("../utils/computeMonthDayGrid");
var _areArraysEqual = require("../../utils/areArraysEqual");
var _utils = require("../../floating-ui-react/utils");
var _composite = require("../../composite/composite");
var _validateDate = require("../../utils/temporal/validateDate");
const BACKWARD_KEYS = new Set([_composite.ARROW_UP, _composite.ARROW_LEFT]);
const CUSTOM_NAVIGATION_KEYS = new Set([_composite.HOME, _composite.END, _composite.PAGE_UP, _composite.PAGE_DOWN]);
function useSharedCalendarDayGridBody(parameters) {
  const {
    fixedWeekNumber,
    children,
    offset = 0
  } = parameters;
  const adapter = (0, _TemporalAdapterContext.useTemporalAdapter)();
  const store = (0, _SharedCalendarRootContext.useSharedCalendarRootContext)();
  const visibleMonth = (0, _store.useStore)(store, _store2.selectors.visibleMonth);
  const timezone = (0, _store.useStore)(store, _store2.selectors.timezoneToRender);
  const ref = React.useRef(null);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const executeAfterItemMapUpdate = React.useRef(null);
  const nowValue = adapter.now(timezone);
  const todayRef = React.useRef(nowValue);
  if (!adapter.isSameDay(todayRef.current, nowValue)) {
    todayRef.current = nowValue;
  }
  const today = todayRef.current;
  const month = React.useMemo(() => {
    return offset === 0 ? visibleMonth : adapter.addMonths(visibleMonth, offset);
  }, [adapter, visibleMonth, offset]);
  const getWeekList = (0, _useCalendarWeekList.useCalendarWeekList)();
  const weeks = React.useMemo(() => getWeekList({
    date: month,
    amount: fixedWeekNumber ?? 'end-of-month'
  }), [getWeekList, month, fixedWeekNumber]);
  const resolvedChildren = React.useMemo(() => {
    if (! /*#__PURE__*/React.isValidElement(children) && typeof children === 'function') {
      return weeks.map(children);
    }
    return children;
  }, [children, weeks]);
  const [itemMap, setItemMap] = React.useState(() => new Map());
  const items = React.useMemo(() => Array.from(itemMap.keys()), [itemMap]);
  const prevDisabledIndicesRef = React.useRef([]);
  const disabledIndices = React.useMemo(() => {
    const output = [];
    for (const itemMetadata of itemMap.values()) {
      if (itemMetadata?.index != null && !itemMetadata.focusable) {
        output.push(itemMetadata.index);
      }
    }
    if ((0, _areArraysEqual.areArraysEqual)(prevDisabledIndicesRef.current, output)) {
      return prevDisabledIndicesRef.current;
    }
    prevDisabledIndicesRef.current = output;
    return output;
  }, [itemMap]);
  const handleItemMapUpdate = newMap => {
    setItemMap(newMap);
  };

  // Execute pending focus callback after React has committed the new item map to the DOM.
  // This replaces a queueMicrotask approach that could fire before React's commit phase.
  (0, _useIsoLayoutEffect.useIsoLayoutEffect)(() => {
    if (executeAfterItemMapUpdate.current) {
      executeAfterItemMapUpdate.current(itemMap);
      executeAfterItemMapUpdate.current = null;
    }
  }, [itemMap]);
  const focusNonDisabledItem = (elements, itemDisabledIndices, guessedIndex, decrement, amount) => {
    if (elements.length === 0) {
      return;
    }
    let idx = guessedIndex;
    if ((0, _utils.isListIndexDisabled)(elements, idx, itemDisabledIndices)) {
      idx = (0, _utils.findNonDisabledListIndex)(elements, {
        startingIndex: idx,
        decrement,
        disabledIndices: itemDisabledIndices,
        amount
      });
    }
    if (idx >= 0 && idx < elements.length) {
      setHighlightedIndex(idx);
      elements[idx]?.focus();
    }
  };
  const focusNextNonDisabledElement = ({
    elements = items,
    newHighlightedIndex,
    decrement,
    amount
  }) => {
    focusNonDisabledItem(elements, disabledIndices, newHighlightedIndex, decrement, amount);
  };

  // Focuses the correct item after a cross-month navigation (PageUp/PageDown or arrow-key
  // loop). Uses the new month's item map directly because the `disabledIndices` state
  // variable still reflects the old month at this point.
  const focusItemFromMap = (newMap, guessedIndex, decrement, amount) => {
    const newItems = Array.from(newMap.keys());
    const newDisabledIndices = [];
    for (const meta of newMap.values()) {
      if (meta?.index != null && !meta.focusable) {
        newDisabledIndices.push(meta.index);
      }
    }
    focusNonDisabledItem(newItems, newDisabledIndices, guessedIndex, decrement, amount);
  };
  const handleKeyboardNavigation = event => {
    const eventKey = event.key;
    if (!CUSTOM_NAVIGATION_KEYS.has(eventKey)) {
      return;
    }
    switch (eventKey) {
      case _composite.HOME:
      case _composite.END:
        {
          const colIndex = highlightedIndex % 7;
          // allow for default composite navigation in case we are on the first or last day of the week
          if (eventKey === _composite.HOME && colIndex === 0 || eventKey === _composite.END && colIndex === 6) {
            return;
          }
          // prevent default composite navigation and handle it ourselves
          event.preventDefault();
          event.preventBaseUIHandler();
          const currentWeekStartIndex = Math.floor(highlightedIndex / 7) * 7;
          const newHighlightedIndex = eventKey === _composite.HOME ? currentWeekStartIndex : currentWeekStartIndex + 6;
          focusNextNonDisabledElement({
            elements: items,
            newHighlightedIndex,
            decrement: eventKey === _composite.END,
            amount: 1
          });
          break;
        }
      case _composite.PAGE_UP:
      case _composite.PAGE_DOWN:
        {
          event.preventDefault();
          // Without knowing the current day we can not move to next month and focus the same day
          const decrement = eventKey === _composite.PAGE_UP;
          let amount = 1;
          if (event.shiftKey) {
            amount = 12;
          }
          const currentDay = (0, _computeMonthDayGrid.computeMonthDayGrid)(adapter, month, fixedWeekNumber, weeks)[highlightedIndex];
          if (!currentDay) {
            return;
          }
          const targetDate = adapter.addMonths(currentDay, decrement ? -amount : amount);
          const targetMonth = adapter.addMonths(visibleMonth, decrement ? -amount : amount);
          const {
            minDate,
            maxDate
          } = store.state;
          // Check if the target date would be within min/max bounds
          let dateValidationError = null;
          if (minDate != null || maxDate != null) {
            dateValidationError = (0, _validateDate.validateDate)({
              adapter,
              value: targetDate,
              validationProps: {
                minDate,
                maxDate
              }
            });
            if (dateValidationError != null) {
              // Block navigation only if the entire target month is outside the valid range.
              // If the month has some valid days, navigate and let focusItemFromMap find the nearest one.
              if (maxDate != null && adapter.isAfter(adapter.startOfMonth(targetMonth), maxDate) || minDate != null && adapter.isBefore(adapter.endOfMonth(targetMonth), minDate)) {
                return;
              }
            }
          }
          store.setVisibleDate(targetMonth, event.nativeEvent, event.currentTarget, _reasons.REASONS.keyboard);
          executeAfterItemMapUpdate.current = newMap => {
            const newMonth = adapter.addMonths(month, decrement ? -amount : amount);
            const newGridDays = (0, _computeMonthDayGrid.computeMonthDayGrid)(adapter, newMonth, fixedWeekNumber);
            // Find the target date in the new month's grid. Use targetDate (already clamped
            // by addMonths) so that e.g. Jan 31 + 1 month correctly finds Feb 28.
            const targetDayOfMonth = adapter.getDate(targetDate);
            const targetMonthValue = adapter.getMonth(targetDate);
            const targetYearValue = adapter.getYear(targetDate);
            const sameDayInNewMonthIndex = newGridDays.findIndex(day => adapter.getDate(day) === targetDayOfMonth && adapter.getMonth(day) === targetMonthValue && adapter.getYear(day) === targetYearValue);
            // When the target day is disabled, find the nearest valid day in the right direction:
            // beyond maxDate → search backward for the last valid day;
            // before minDate → search forward for the first valid day.
            let searchDecrement = eventKey === _composite.PAGE_UP;
            if (dateValidationError === 'after-max-date') {
              searchDecrement = true;
            } else if (dateValidationError === 'before-min-date') {
              searchDecrement = false;
            }
            focusItemFromMap(newMap, sameDayInNewMonthIndex, searchDecrement, 1);
          };
          break;
        }
      default:
        {
          break;
        }
    }
  };
  const handleLooping = (event, prevIndex) => {
    event.preventDefault();
    const eventKey = event.key;
    const decrement = BACKWARD_KEYS.has(eventKey);
    const targetMonth = adapter.addMonths(visibleMonth, decrement ? -1 : 1);
    const {
      minDate,
      maxDate
    } = store.state;
    if (minDate != null || maxDate != null) {
      // Check if the target month has any valid (non-disabled) days within min/max bounds.
      if (minDate != null && adapter.isBefore(adapter.endOfMonth(targetMonth), minDate) || maxDate != null && adapter.isAfter(adapter.startOfMonth(targetMonth), maxDate)) {
        // The entire target month is outside the valid range; stay put.
        return prevIndex;
      }
    }

    // Change the visible month and focus the equivalent day once the new month's
    // DOM has been committed. This covers every arrow-key loop scenario, including
    // cases where an outside-month day is visible as the first/last row of the
    // current grid — the visible date must always update when crossing a month boundary.
    store.setVisibleDate(targetMonth, event.nativeEvent, event.currentTarget, _reasons.REASONS.keyboard);
    executeAfterItemMapUpdate.current = newMap => {
      const newItems = Array.from(newMap.keys());
      let guessedIndex;
      if (eventKey === _composite.ARROW_LEFT) {
        guessedIndex = newItems.length - 1;
      } else if (eventKey === _composite.ARROW_RIGHT) {
        guessedIndex = 0;
      } else if (eventKey === _composite.ARROW_DOWN) {
        guessedIndex = prevIndex % 7;
      } else {
        // ARROW_UP: same weekday in the last row of the previous month
        guessedIndex = newItems.length - 7 + prevIndex % 7;
      }
      focusItemFromMap(newMap, guessedIndex, decrement, _composite.HORIZONTAL_KEYS.has(eventKey) ? 1 : 7);
    };

    // Return the current index so the composite does not move focus before the new month renders.
    return prevIndex;
  };
  const compositeRootProps = {
    cols: 7,
    disabledIndices,
    orientation: 'horizontal',
    enableHomeAndEndKeys: true,
    onMapChange: handleItemMapUpdate,
    highlightedIndex,
    onKeyDown: handleKeyboardNavigation,
    onHighlightedIndexChange: setHighlightedIndex,
    onLoop: handleLooping
  };
  const props = {
    children: resolvedChildren
  };
  const context = React.useMemo(() => ({
    month,
    today
  }), [month, today]);
  return {
    props,
    compositeRootProps,
    context,
    ref
  };
}