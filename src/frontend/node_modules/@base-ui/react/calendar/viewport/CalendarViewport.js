"use strict";
'use client';

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard").default;
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CalendarViewport = CalendarViewport;
var React = _interopRequireWildcard(require("react"));
var _inertValue = require("@base-ui/utils/inertValue");
var _useAnimationFrame = require("@base-ui/utils/useAnimationFrame");
var _useIsoLayoutEffect = require("@base-ui/utils/useIsoLayoutEffect");
var _owner = require("@base-ui/utils/owner");
var _store = require("@base-ui/utils/store");
var _useAnimationsFinished = require("../../utils/useAnimationsFinished");
var _CalendarViewportDataAttributes = require("./CalendarViewportDataAttributes");
var _SharedCalendarRootContext = require("../root/SharedCalendarRootContext");
var _store2 = require("../store");
var _TemporalAdapterContext = require("../../temporal-adapter-provider/TemporalAdapterContext");
var _jsxRuntime = require("react/jsx-runtime");
const getNavigationDirectionAttribute = navigationDirection => {
  switch (navigationDirection) {
    case 'none':
      return null;
    default:
      return {
        [_CalendarViewportDataAttributes.CalendarViewportDataAttributes.navigationDirection]: navigationDirection
      };
  }
};
const ALLOWED_TAGS = new Set(['div', 'section', 'span', 'tbody']);
function getSafeTag(localName) {
  return ALLOWED_TAGS.has(localName) ? localName : 'div';
}
function getVisibleMonthKey(adapter, visibleMonth) {
  if (!visibleMonth) {
    return 'empty';
  }
  return `${adapter.getYear(visibleMonth)}-${adapter.getMonth(visibleMonth)}`;
}
const DATA_ATTRIBUTES = [_CalendarViewportDataAttributes.CalendarViewportDataAttributes.current, _CalendarViewportDataAttributes.CalendarViewportDataAttributes.startingStyle, _CalendarViewportDataAttributes.CalendarViewportDataAttributes.endingStyle, _CalendarViewportDataAttributes.CalendarViewportDataAttributes.navigationDirection];

/**
 * A viewport for displaying calendar month transitions.
 * This component is only required if you want to animate certain part of a calendar when navigating between months.
 * The first rendered child element has to handle a ref.
 * Passes `data-current` to the currently visible content and `data-previous` to the previous content when animating between two.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Calendar](https://base-ui.com/react/components/calendar)
 */
function CalendarViewport({
  children
}) {
  const store = (0, _SharedCalendarRootContext.useSharedCalendarRootContext)();
  const adapter = (0, _TemporalAdapterContext.useTemporalAdapter)();
  const navigationDirection = (0, _store.useStore)(store, _store2.selectors.navigationDirection);
  const visibleMonth = (0, _store.useStore)(store, _store2.selectors.visibleMonth);
  // Remount the entering month on visible-month changes so interrupted transitions
  // restart from the correct starting styles instead of reusing the previous DOM.
  const currentContentKey = getVisibleMonthKey(adapter, visibleMonth);
  const lastHandledVisibleMonth = React.useRef(visibleMonth);
  const capturedNodeRef = React.useRef(null);
  const [previousContentNode, setPreviousContentNode] = React.useState(null);
  const currentContainerRef = React.useRef(null);
  const previousContainerRef = React.useRef(null);
  const onAnimationsFinished = (0, _useAnimationsFinished.useAnimationsFinished)(currentContainerRef, true, false);
  const cleanupTimeout = (0, _useAnimationFrame.useAnimationFrame)();
  const abortControllerRef = React.useRef(null);
  const [showStartingStyleAttribute, setShowStartingStyleAttribute] = React.useState(false);
  (0, _useIsoLayoutEffect.useIsoLayoutEffect)(() => {
    // When the visible month changes,
    // set the captured children HTML to state,
    // so we can render both new and old month when transitioning.
    if (visibleMonth && lastHandledVisibleMonth.current && !adapter.isEqual(lastHandledVisibleMonth.current, visibleMonth) && capturedNodeRef.current) {
      // Cancel the previous transition's pending animation-finished callback
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setPreviousContentNode(capturedNodeRef.current);
      setShowStartingStyleAttribute(true);
      cleanupTimeout.request(() => {
        setShowStartingStyleAttribute(false);
        onAnimationsFinished(() => {
          setPreviousContentNode(null);
          capturedNodeRef.current = null;
        }, abortController.signal);
      });
      lastHandledVisibleMonth.current = visibleMonth;
    }
  }, [adapter, cleanupTimeout, onAnimationsFinished, visibleMonth]);

  // Capture a clone of the current content DOM subtree when not transitioning.
  // We can't store previous React nodes as they may be stateful; instead we capture DOM clones for visual continuity.
  (0, _useIsoLayoutEffect.useIsoLayoutEffect)(() => {
    // When a transition is in progress, we store the next content in capturedNodeRef.
    // This handles the case where the trigger changes multiple times before the transition finishes.
    // We want to always capture the latest content for the previous snapshot.
    // So clicking quickly on T1, T2, T3 will result in the following sequence:
    // 1. T1 -> T2: previousContent = T1, currentContent = T2
    // 2. T2 -> T3: previousContent = T2, currentContent = T3
    const source = currentContainerRef.current;
    if (!source) {
      return;
    }

    // Create the wrapper element of the same type as the source element.
    // It has to be an element of the same tag, especially if it's the calendar body (`tbody`).
    const wrapper = (0, _owner.ownerDocument)(source).createElement(getSafeTag(source.localName));
    for (const child of Array.from(source.childNodes)) {
      wrapper.appendChild(child.cloneNode(true));
    }
    capturedNodeRef.current = wrapper;
  });
  const currentChildren = /*#__PURE__*/React.cloneElement(children, {
    ref: currentContainerRef,
    key: currentContentKey
  });
  const isTransitioning = previousContentNode != null;
  let childrenToRender;
  if (!isTransitioning) {
    childrenToRender = currentChildren;
  } else {
    childrenToRender = /*#__PURE__*/(0, _jsxRuntime.jsxs)(React.Fragment, {
      children: [navigationDirection === 'previous' && currentChildren, /*#__PURE__*/React.createElement(getSafeTag(previousContentNode.localName), {
        className: currentContainerRef?.current?.className,
        key: 'previous',
        ref: previousContainerRef,
        'data-previous': '',
        'data-starting-style': showStartingStyleAttribute ? '' : undefined,
        'data-ending-style': showStartingStyleAttribute ? undefined : '',
        inert: (0, _inertValue.inertValue)(true),
        ...getNavigationDirectionAttribute(navigationDirection)
      }), navigationDirection === 'next' && currentChildren]
    });
  }

  // Avoids remounting the current month after transition ends.
  (0, _useIsoLayoutEffect.useIsoLayoutEffect)(() => {
    if (!currentContainerRef.current) {
      return;
    }
    if (isTransitioning) {
      currentContainerRef.current.setAttribute('data-current', '');
      if (showStartingStyleAttribute) {
        currentContainerRef.current.setAttribute('data-starting-style', '');
      } else {
        currentContainerRef.current.setAttribute('data-ending-style', '');
        currentContainerRef.current.removeAttribute('data-starting-style');
      }
      const navigationDirectionAttribute = getNavigationDirectionAttribute(navigationDirection);
      if (navigationDirectionAttribute) {
        currentContainerRef.current.setAttribute(...Object.entries(navigationDirectionAttribute)[0]);
      }
    } else {
      for (const attribute of DATA_ATTRIBUTES) {
        currentContainerRef.current.removeAttribute(attribute);
      }
    }
  }, [isTransitioning, showStartingStyleAttribute, navigationDirection]);

  // When previousContentNode is present, imperatively populate the previous container with the cloned children.
  (0, _useIsoLayoutEffect.useIsoLayoutEffect)(() => {
    const container = previousContainerRef.current;
    if (!container || !previousContentNode) {
      return;
    }
    container.replaceChildren(...Array.from(previousContentNode.childNodes));
  }, [previousContentNode]);
  return childrenToRender;
}