// @vitest-environment jsdom
/**
 * list-nav-keys — key mapping + the editable-target guard. jsdom gives us real
 * HTMLElement subtypes so isEditableTarget can be asserted against genuine
 * INPUT/TEXTAREA/SELECT/contentEditable nodes rather than hand-rolled shims.
 */
import { describe, expect, it } from 'vitest';
import { isEditableTarget, navActionForKey } from './list-nav-keys';

describe('navActionForKey', () => {
  it('maps j and ArrowDown to down', () => {
    expect(navActionForKey('j')).toBe('down');
    expect(navActionForKey('ArrowDown')).toBe('down');
  });

  it('maps k and ArrowUp to up', () => {
    expect(navActionForKey('k')).toBe('up');
    expect(navActionForKey('ArrowUp')).toBe('up');
  });

  it('maps Enter to open and Escape to escape', () => {
    expect(navActionForKey('Enter')).toBe('open');
    expect(navActionForKey('Escape')).toBe('escape');
  });

  it('ignores uppercase J/K (a Shift chord is not navigation)', () => {
    expect(navActionForKey('J')).toBeNull();
    expect(navActionForKey('K')).toBeNull();
  });

  it('returns null for any other key', () => {
    expect(navActionForKey('a')).toBeNull();
    expect(navActionForKey(' ')).toBeNull();
    expect(navActionForKey('Tab')).toBeNull();
    expect(navActionForKey('ArrowLeft')).toBeNull();
  });
});

describe('isEditableTarget', () => {
  it('is true for INPUT, TEXTAREA, and SELECT', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
  });

  it('is true for a contentEditable host', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    // jsdom does not derive isContentEditable from the attribute; force it.
    Object.defineProperty(el, 'isContentEditable', { value: true });
    expect(isEditableTarget(el)).toBe(true);
  });

  it('is false for a plain div or button', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
  });

  it('is false for null', () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});
