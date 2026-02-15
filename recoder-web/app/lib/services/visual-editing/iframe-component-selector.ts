/**
 * Iframe Component Selector Script
 *
 * This script is injected into the preview iframe to enable visual component selection.
 * It handles:
 * - Component overlay highlighting on hover
 * - Click-to-select components
 * - Keyboard shortcuts
 * - Communication with parent window via postMessage
 *
 * This is a string that will be injected via <script> tag or eval.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('IframeComponentSelector');

export const COMPONENT_SELECTOR_SCRIPT = `
(() => {
  // Skip if already initialized
  if (window.__RECODER_COMPONENT_SELECTOR_INITIALIZED__) return;
  window.__RECODER_COMPONENT_SELECTOR_INITIALIZED__ = true;

  const OVERLAY_CLASS = '__recoder_overlay__';
  let overlays = [];
  let hoverOverlay = null;
  let hoverLabel = null;
  let currentHoveredElement = null;
  let highlightedElement = null;
  let componentCoordinates = null;

  // State machine: inactive, inspecting, selected
  let state = { type: 'inactive' };

  /* ---------- helpers --------------------------------------------------- */
  const css = (el, obj) => Object.assign(el.style, obj);

  function makeOverlay() {
    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    css(overlay, {
      position: 'absolute',
      border: '2px solid #3b82f6',
      background: 'rgba(59, 130, 246, 0.05)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    });

    const label = document.createElement('div');
    css(label, {
      position: 'absolute',
      left: '0',
      top: '100%',
      transform: 'translateY(4px)',
      background: '#3b82f6',
      color: '#fff',
      fontFamily: 'ui-monospace, monospace',
      fontSize: '11px',
      lineHeight: '1.2',
      padding: '3px 6px',
      whiteSpace: 'nowrap',
      borderRadius: '4px',
      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.1)',
    });
    overlay.appendChild(label);
    document.body.appendChild(overlay);

    return { overlay, label };
  }

  function updateOverlay(el, isSelected = false, isHighlighted = false) {
    if (!el) {
      if (hoverOverlay) hoverOverlay.style.display = 'none';
      return;
    }

    if (isSelected) {
      if (overlays.some((item) => item.el === el)) {
        return;
      }

      const { overlay, label } = makeOverlay();
      overlays.push({ overlay, label, el });

      const rect = el.getBoundingClientRect();
      const borderColor = isHighlighted ? '#22c55e' : '#3b82f6';
      const backgroundColor = isHighlighted
        ? 'rgba(34, 197, 94, 0.05)'
        : 'rgba(59, 130, 246, 0.05)';

      css(overlay, {
        top: rect.top + window.scrollY + 'px',
        left: rect.left + window.scrollX + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
        display: 'block',
        border: '3px solid ' + borderColor,
        background: backgroundColor,
      });

      css(label, { display: 'none' });
      return;
    }

    // Hover overlay
    if (!hoverOverlay || !hoverLabel) {
      const o = makeOverlay();
      hoverOverlay = o.overlay;
      hoverLabel = o.label;
    }

    const rect = el.getBoundingClientRect();
    css(hoverOverlay, {
      top: rect.top + window.scrollY + 'px',
      left: rect.left + window.scrollX + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      display: 'block',
      border: '2px solid #3b82f6',
      background: 'rgba(59, 130, 246, 0.05)',
    });
    css(hoverLabel, { background: '#3b82f6' });

    while (hoverLabel.firstChild) hoverLabel.removeChild(hoverLabel.firstChild);

    const name = el.dataset.recoderName || el.tagName.toLowerCase();
    const file = (el.dataset.recoderId || '').split(':')[0];

    const nameEl = document.createElement('div');
    nameEl.textContent = name;
    hoverLabel.appendChild(nameEl);

    if (file) {
      const fileEl = document.createElement('span');
      css(fileEl, { fontSize: '10px', opacity: '.8' });
      fileEl.textContent = file.replace(/\\\\/g, '/');
      hoverLabel.appendChild(fileEl);
    }

    requestAnimationFrame(updateAllOverlayPositions);
  }

  function updateAllOverlayPositions() {
    overlays.forEach(({ overlay, el }) => {
      const rect = el.getBoundingClientRect();
      css(overlay, {
        top: rect.top + window.scrollY + 'px',
        left: rect.left + window.scrollX + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
      });
    });

    if (hoverOverlay && hoverOverlay.style.display !== 'none' && state.element) {
      const rect = state.element.getBoundingClientRect();
      css(hoverOverlay, {
        top: rect.top + window.scrollY + 'px',
        left: rect.left + window.scrollX + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px',
      });
    }

    if (highlightedElement) {
      const highlightedItem = overlays.find(({ el }) => el === highlightedElement);
      if (highlightedItem) {
        const rect = highlightedItem.el.getBoundingClientRect();
        window.parent.postMessage({
          type: 'recoder:component-coordinates-updated',
          coordinates: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
        }, '*');
      }
    }
  }

  function clearOverlays() {
    overlays.forEach(({ overlay }) => overlay.remove());
    overlays = [];

    if (hoverOverlay) {
      hoverOverlay.remove();
      hoverOverlay = null;
      hoverLabel = null;
    }

    currentHoveredElement = null;
    highlightedElement = null;
  }

  function removeOverlayById(componentId) {
    const indicesToRemove = [];
    overlays.forEach((item, index) => {
      if (item.el.dataset.recoderId === componentId) {
        indicesToRemove.push(index);
      }
    });

    for (let i = indicesToRemove.length - 1; i >= 0; i--) {
      const { overlay } = overlays[indicesToRemove[i]];
      overlay.remove();
      overlays.splice(indicesToRemove[i], 1);
    }

    if (highlightedElement && highlightedElement.dataset.recoderId === componentId) {
      highlightedElement = null;
    }
  }

  function isMouseOverToolbar(mouseX, mouseY) {
    if (!componentCoordinates) return false;
    const toolbarTop = componentCoordinates.top + componentCoordinates.height + 4;
    const toolbarLeft = componentCoordinates.left;
    const toolbarHeight = 60;
    const toolbarWidth = componentCoordinates.width || 400;
    return (
      mouseY >= toolbarTop &&
      mouseY <= toolbarTop + toolbarHeight &&
      mouseX >= toolbarLeft &&
      mouseX <= toolbarLeft + toolbarWidth
    );
  }

  function updateSelectedOverlayLabel(item, show) {
    const { label, el } = item;

    if (!show) {
      css(label, { display: 'none' });
      requestAnimationFrame(updateAllOverlayPositions);
      return;
    }

    css(label, { display: 'block', background: '#3b82f6' });
    while (label.firstChild) label.removeChild(label.firstChild);

    const editLine = document.createElement('div');
    editLine.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="white" style="display:inline-block;vertical-align:-2px;margin-right:4px"><path d="M8 0L9.48528 6.51472L16 8L9.48528 9.48528L8 16L6.51472 9.48528L0 8L6.51472 6.51472L8 0Z"/></svg>Edit with AI';
    label.appendChild(editLine);

    const name = el.dataset.recoderName || el.tagName.toLowerCase();
    const file = (el.dataset.recoderId || '').split(':')[0];
    const nameEl = document.createElement('div');
    nameEl.textContent = name;
    label.appendChild(nameEl);

    if (file) {
      const fileEl = document.createElement('span');
      css(fileEl, { fontSize: '10px', opacity: '.8' });
      fileEl.textContent = file.replace(/\\\\/g, '/');
      label.appendChild(fileEl);
    }

    requestAnimationFrame(updateAllOverlayPositions);
  }

  /* ---------- event handlers -------------------------------------------- */
  function onMouseMove(e) {
    if (isMouseOverToolbar(e.clientX, e.clientY)) {
      if (currentHoveredElement) {
        const previousItem = overlays.find((item) => item.el === currentHoveredElement);
        if (previousItem) {
          updateSelectedOverlayLabel(previousItem, false);
        }
        currentHoveredElement = null;
      }
      return;
    }

    let el = e.target;
    while (el && !el.dataset.recoderId) el = el.parentElement;

    const hoveredItem = overlays.find((item) => item.el === el);

    if (currentHoveredElement && currentHoveredElement !== el) {
      const previousItem = overlays.find((item) => item.el === currentHoveredElement);
      if (previousItem) {
        updateSelectedOverlayLabel(previousItem, false);
      }
    }

    currentHoveredElement = el;

    if (hoveredItem && hoveredItem.el !== highlightedElement) {
      updateSelectedOverlayLabel(hoveredItem, true);
      if (hoverOverlay) hoverOverlay.style.display = 'none';
    }

    if (state.type === 'inspecting') {
      if (state.element === el) return;
      state.element = el;

      if (!hoveredItem && el) {
        updateOverlay(el, false);
      } else if (!el) {
        if (hoverOverlay) hoverOverlay.style.display = 'none';
      }
    }
  }

  function onMouseLeave(e) {
    if (!e.relatedTarget) {
      if (hoverOverlay) {
        hoverOverlay.style.display = 'none';
        requestAnimationFrame(updateAllOverlayPositions);
      }
      currentHoveredElement = null;
      if (state.type === 'inspecting') {
        state.element = null;
      }
    }
  }

  function onClick(e) {
    if (state.type !== 'inspecting' || !state.element) return;
    e.preventDefault();
    e.stopPropagation();

    const clickedComponentId = state.element.dataset.recoderId;
    const selectedItem = overlays.find((item) => item.el === state.element);

    // If clicking on already selected/highlighted, deselect
    if (selectedItem && highlightedElement === state.element) {
      if (state.element.contentEditable === 'true') {
        return;
      }

      removeOverlayById(clickedComponentId);
      requestAnimationFrame(updateAllOverlayPositions);
      highlightedElement = null;

      window.parent.postMessage({
        type: 'recoder:component-deselected',
        componentId: clickedComponentId,
      }, '*');
      return;
    }

    // Update previously highlighted
    if (highlightedElement && highlightedElement !== state.element) {
      const previousItem = overlays.find((item) => item.el === highlightedElement);
      if (previousItem) {
        css(previousItem.overlay, {
          border: '3px solid #3b82f6',
          background: 'rgba(59, 130, 246, 0.05)',
        });
      }
    }

    highlightedElement = state.element;

    if (selectedItem) {
      css(selectedItem.overlay, {
        border: '3px solid #22c55e',
        background: 'rgba(34, 197, 94, 0.05)',
      });
    }

    if (!selectedItem) {
      updateOverlay(state.element, true, true);
      requestAnimationFrame(updateAllOverlayPositions);
    }

    // Assign runtime ID if not present
    if (!state.element.dataset.recoderRuntimeId) {
      state.element.dataset.recoderRuntimeId = 'recoder-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    const rect = state.element.getBoundingClientRect();
    window.parent.postMessage({
      type: 'recoder:component-selected',
      component: {
        id: clickedComponentId,
        name: state.element.dataset.recoderName || state.element.tagName.toLowerCase(),
        runtimeId: state.element.dataset.recoderRuntimeId,
      },
      coordinates: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
    }, '*');
  }

  function onKeyDown(e) {
    if (
      e.target.tagName === 'INPUT' ||
      e.target.tagName === 'TEXTAREA' ||
      e.target.isContentEditable
    ) {
      return;
    }

    const key = e.key.toLowerCase();
    const hasShift = e.shiftKey;
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const hasCtrlOrMeta = isMac ? e.metaKey : e.ctrlKey;

    if (key === 'c' && hasShift && hasCtrlOrMeta) {
      e.preventDefault();
      window.parent.postMessage({ type: 'recoder:select-component-shortcut' }, '*');
    }
  }

  /* ---------- activation / deactivation --------------------------------- */
  function activate() {
    if (state.type === 'inactive') {
      window.addEventListener('click', onClick, true);
    }
    state = { type: 'inspecting', element: null };
  }

  function deactivate() {
    if (state.type === 'inactive') return;

    window.removeEventListener('click', onClick, true);
    if (hoverOverlay) {
      hoverOverlay.style.display = 'none';
    }

    overlays.forEach((item) => updateSelectedOverlayLabel(item, false));
    currentHoveredElement = null;

    state = { type: 'inactive' };
  }

  /* ---------- message bridge -------------------------------------------- */
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;

    const { type, data, componentId, coordinates } = e.data;

    switch (type) {
      case 'recoder:activate-component-selector':
        activate();
        break;
      case 'recoder:deactivate-component-selector':
        deactivate();
        break;
      case 'recoder:clear-overlays':
        clearOverlays();
        break;
      case 'recoder:update-overlay-positions':
        updateAllOverlayPositions();
        break;
      case 'recoder:update-component-coordinates':
        componentCoordinates = coordinates;
        break;
      case 'recoder:remove-overlay':
        if (componentId) {
          removeOverlayById(componentId);
        }
        break;
    }
  });

  // Always listen for keyboard shortcuts and mouse events
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('mouseleave', onMouseLeave, true);
  window.addEventListener('resize', updateAllOverlayPositions);
  window.addEventListener('scroll', updateAllOverlayPositions, true);

  // Notify parent that selector is initialized
  function initializeComponentSelector() {
    if (!document.body) {
      console.error('Recoder component selector: document.body not found');
      return;
    }

    setTimeout(() => {
      window.parent.postMessage({
        type: 'recoder:component-selector-initialized',
      }, '*');
      console.debug('Recoder component selector initialized');
    }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeComponentSelector);
  } else {
    initializeComponentSelector();
  }
})();
`;

/**
 * Inject the component selector script into an iframe
 */
export function injectComponentSelector(iframe: HTMLIFrameElement): boolean {
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      logger.warn('[VisualEditing] Cannot access iframe document');
      return false;
    }

    const script = iframeDoc.createElement('script');
    script.textContent = COMPONENT_SELECTOR_SCRIPT;
    iframeDoc.head.appendChild(script);

    return true;
  } catch (error) {
    logger.error('[VisualEditing] Failed to inject component selector:', error);
    return false;
  }
}

/**
 * Send message to activate the component selector in the iframe
 */
export function activateSelector(iframe: HTMLIFrameElement): void {
  iframe.contentWindow?.postMessage(
    { type: 'recoder:activate-component-selector' },
    '*'
  );
}

/**
 * Send message to deactivate the component selector in the iframe
 */
export function deactivateSelector(iframe: HTMLIFrameElement): void {
  iframe.contentWindow?.postMessage(
    { type: 'recoder:deactivate-component-selector' },
    '*'
  );
}

/**
 * Send message to clear all overlays in the iframe
 */
export function clearOverlays(iframe: HTMLIFrameElement): void {
  iframe.contentWindow?.postMessage(
    { type: 'recoder:clear-overlays' },
    '*'
  );
}

/**
 * Send message to remove a specific component overlay
 */
export function removeOverlay(iframe: HTMLIFrameElement, componentId: string): void {
  iframe.contentWindow?.postMessage(
    { type: 'recoder:remove-overlay', componentId },
    '*'
  );
}

/**
 * Send message to update overlay positions (after scroll/resize)
 */
export function updateOverlayPositions(iframe: HTMLIFrameElement): void {
  iframe.contentWindow?.postMessage(
    { type: 'recoder:update-overlay-positions' },
    '*'
  );
}

/**
 * Send component coordinates for toolbar positioning
 */
export function updateComponentCoordinates(
  iframe: HTMLIFrameElement,
  coordinates: { top: number; left: number; width: number; height: number }
): void {
  iframe.contentWindow?.postMessage(
    { type: 'recoder:update-component-coordinates', coordinates },
    '*'
  );
}
