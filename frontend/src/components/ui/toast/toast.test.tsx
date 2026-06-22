import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { toast, __resetToasts } from './toast';
import { ToastContainer } from './ToastContainer';
import { EXIT_LIFECYCLE_MS } from './constants';

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderToast() {
  return render(<ToastContainer />);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Toast system (imperative API)', () => {
  // Clean up portal host and reset module state between tests
  afterEach(() => {
    document.getElementById('toast-root')?.remove();
    __resetToasts();
  });

  // ── Timer-based tests ──────────────────────────────────────────────────
  describe('auto-dismiss behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('danger toast renders with role="alert" and persists (no auto-dismiss)', () => {
      renderToast();

      act(() => {
        toast.danger('Danger message', { title: 'Error' });
      });

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Danger message');
      expect(alert).toHaveTextContent('Error');

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // danger toast must still be present (it is sticky)
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('success toast auto-removes after 4000ms + EXIT_LIFECYCLE_MS', () => {
      renderToast();

      act(() => {
        toast.success('Success message');
      });

      expect(screen.getByText('Success message')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(4000 + EXIT_LIFECYCLE_MS);
      });

      expect(screen.queryByText('Success message')).not.toBeInTheDocument();
    });

    it('warn toast auto-dismisses after 6000ms + EXIT_LIFECYCLE_MS', () => {
      renderToast();

      act(() => {
        toast.warn('Warning message');
      });

      expect(screen.getByText('Warning message')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(6000 + EXIT_LIFECYCLE_MS);
      });

      expect(screen.queryByText('Warning message')).not.toBeInTheDocument();
    });
  });

  // ── Manual dismiss ─────────────────────────────────────────────────────
  describe('manual dismiss', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('clicking close button dismisses toast with exit animation then removes it', () => {
      renderToast();

      act(() => {
        toast.success('Closable toast');
      });

      const toastEl = screen.getByText('Closable toast').closest('[role]')!;

      // Should have enter animation class
      expect(toastEl.className).toContain('animate-toast-in');

      // Click the close button
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      // Advance past exit lifecycle
      act(() => {
        vi.advanceTimersByTime(EXIT_LIFECYCLE_MS);
      });

      expect(screen.queryByText('Closable toast')).not.toBeInTheDocument();
    });

    it('dismiss() method removes a toast by ID', () => {
      renderToast();

      act(() => {
        toast.success('Dismissable');
      });

      expect(screen.getByText('Dismissable')).toBeInTheDocument();

      // Read actual toast ID from DOM (module-scoped nextId increments across tests)
      const toastEl = screen.getByText('Dismissable').closest('[data-toastid]')!;
      const toastId = Number(toastEl.getAttribute('data-toastid'));

      act(() => {
        toast.dismiss(toastId);
      });

      act(() => {
        vi.advanceTimersByTime(EXIT_LIFECYCLE_MS);
      });

      expect(screen.queryByText('Dismissable')).not.toBeInTheDocument();
    });

    it('manual dismiss clears the auto-dismiss timer', () => {
      renderToast();

      act(() => {
        toast.success('Timer cleared');
      });

      // Advance partially (less than auto-dismiss threshold)
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Manually dismiss
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      // Advance past what would have been the auto-dismiss time
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Toast should be gone (exit lifecycle is only 200ms)
      expect(screen.queryByText('Timer cleared')).not.toBeInTheDocument();
    });
  });

  // ── Portal ─────────────────────────────────────────────────────────────
  it('portal host #toast-root exists in document.body', () => {
    renderToast();

    // Portal div should exist (lazy-created on mount)
    const portal = document.getElementById('toast-root');
    expect(portal).toBeInTheDocument();

    act(() => {
      toast.danger('Portal test');
    });

    expect(portal).toContainElement(screen.getByText('Portal test'));
  });

  // ── Positioning / grouping ─────────────────────────────────────────────
  it('toasts in different positions each get their own stack with correct position classes', () => {
    renderToast();

    act(() => {
      toast.success('Bottom-right toast');
      toast.warn('Top-left toast', { position: 'top-left' });
    });

    const stacks = document.querySelectorAll('#toast-root > div');
    expect(stacks.length).toBe(2);

    const bottomRightStack = document.querySelector('#toast-root .bottom-4.right-4');
    expect(bottomRightStack).toBeInTheDocument();

    const topLeftStack = document.querySelector('#toast-root .top-4.left-4');
    expect(topLeftStack).toBeInTheDocument();
  });

  it('multiple toasts in the same position stack together', () => {
    renderToast();

    act(() => {
      toast.success('Toast 1');
      toast.warn('Toast 2');
      toast.danger('Toast 3');
    });

    const bottomRightStack = document.querySelector('#toast-root .bottom-4.right-4');
    expect(bottomRightStack).toBeInTheDocument();
    expect(bottomRightStack!.children.length).toBe(3);
    expect(bottomRightStack!).toHaveTextContent('Toast 1');
    expect(bottomRightStack!).toHaveTextContent('Toast 2');
    expect(bottomRightStack!).toHaveTextContent('Toast 3');
  });

  // ── Animations ─────────────────────────────────────────────────────────
  it('bottom-right toast mounts with animate-toast-in-right class', () => {
    renderToast();

    act(() => {
      toast.success('Animation test');
    });

    const toastEl = screen.getByText('Animation test').closest('[role]')!;
    expect(toastEl.className).toContain('animate-toast-in-right');
  });

  // ── Deprecated aliases ─────────────────────────────────────────────────
  it('deprecated error() alias works the same as danger()', () => {
    renderToast();

    act(() => {
      toast.error('Error via deprecated');
    });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Error via deprecated');
  });

  it('deprecated warning() alias works the same as warn()', () => {
    renderToast();

    act(() => {
      toast.warning('Warning via deprecated');
    });

    expect(screen.getByText('Warning via deprecated')).toBeInTheDocument();
  });

  // ── Options ────────────────────────────────────────────────────────────
  it('custom position option is respected', () => {
    renderToast();

    act(() => {
      toast.success('Top-center toast', { position: 'top-center' });
    });

    const topCenterStack = document.querySelector('#toast-root .top-4.left-1\\/2');
    expect(topCenterStack).toBeInTheDocument();
  });

  it('custom animation option overrides position-default animation', () => {
    renderToast();

    act(() => {
      toast.success('Custom animation', { animation: 'slideDown' });
    });

    const toastEl = screen.getByText('Custom animation').closest('[role]')!;
    expect(toastEl.className).toContain('animate-toast-in-down');
    expect(toastEl.className).not.toContain('animate-toast-in-right');
  });

  // ── Title ──────────────────────────────────────────────────────────────
  it('title renders when provided', () => {
    renderToast();

    act(() => {
      toast.success('Body text', { title: 'My Title' });
    });

    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
  });

  it('title is absent when not provided', () => {
    renderToast();

    act(() => {
      toast.success('No title toast');
    });

    const toastContainer = screen.getByText('No title toast').closest('[role]');
    expect(toastContainer).toBeInTheDocument();
    const headings = toastContainer!.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, strong, [data-title]',
    );
    expect(headings.length).toBe(0);
  });

  // ── Callable outside React ─────────────────────────────────────────────
  it('toast API works when called outside a React component', () => {
    // No ToastContainer rendered yet — toast should queue silently
    toast.success('Queued before render');

    // Now render the container
    render(<ToastContainer />);

    // Previously queued toast should now appear
    expect(screen.getByText('Queued before render')).toBeInTheDocument();
  });
});
