// @vitest-environment jsdom
/**
 * PermissionCoach — macOS-only, dismissible full-disk-access coach card.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { PermissionCoach } from './PermissionCoach';

let container: HTMLDivElement | null = null;

function mount(): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  container = c;
  act(() => render(<PermissionCoach />, c));
  return c;
}

afterEach(() => {
  if (container) {
    act(() => render(null, container as HTMLDivElement));
    container.remove();
    container = null;
  }
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  delete (window as unknown as Record<string, unknown>).recoderDesktop;
});

describe('PermissionCoach', () => {
  it('renders on macOS with a full-disk-access prompt', () => {
    (window as unknown as Record<string, unknown>).recoderDesktop = { platform: 'darwin' };
    const c = mount();
    expect(c.querySelector('.permission-coach')).not.toBeNull();
    expect(c.textContent).toMatch(/full disk access/i);
  });

  it('renders nothing on non-macOS platforms', () => {
    (window as unknown as Record<string, unknown>).recoderDesktop = { platform: 'linux' };
    expect(mount().querySelector('.permission-coach')).toBeNull();
  });

  it('renders nothing outside the desktop shell (no bridge)', () => {
    expect(mount().querySelector('.permission-coach')).toBeNull();
  });

  it('opens System Settings when the action is clicked', () => {
    const openSystemSettings = vi.fn(async () => ({ ok: true }));
    (window as unknown as Record<string, unknown>).recoderDesktop = { platform: 'darwin', openSystemSettings };
    const c = mount();
    act(() => {
      (c.querySelector('.permission-coach-action') as HTMLButtonElement).click();
    });
    expect(openSystemSettings).toHaveBeenCalledWith('fullDiskAccess');
  });

  it('dismisses and stays dismissed (persisted)', () => {
    (window as unknown as Record<string, unknown>).recoderDesktop = { platform: 'darwin' };
    const c = mount();
    act(() => {
      (c.querySelector('.permission-coach-close') as HTMLButtonElement).click();
    });
    expect(c.querySelector('.permission-coach')).toBeNull();
    expect(localStorage.getItem('recoder.permissionCoach.dismissed')).toBe('1');
  });
});
