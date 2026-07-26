/**
 * Test: Dialog — Radix Dialog wrapper using app.* tokens
 *
 * Verifies:
 * - Renders the trigger and content
 * - Closes when the DialogClose button is clicked
 * - Renders the title and description inside the content
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './Dialog';

describe('Dialog', () => {
  it('renders the trigger and the content (open by default)', () => {
    render(
      <Dialog defaultOpen>
        <DialogTrigger asChild>
          <button>Open</button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My Title</DialogTitle>
            <DialogDescription>My description</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button>Close</button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('My description')).toBeInTheDocument();
  });

  it('closes via the close button (calls onOpenChange with false)', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Closable</DialogTitle>
          <DialogClose asChild>
            <button>Close</button>
          </DialogClose>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText('Closable')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders title and description with the proper data-slot attributes', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>Slot Title</DialogTitle>
          <DialogDescription>Slot Description</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const title = screen.getByText('Slot Title');
    expect(title.getAttribute('data-slot')).toBe('dialog-title');
    const desc = screen.getByText('Slot Description');
    expect(desc.getAttribute('data-slot')).toBe('dialog-description');
  });
});