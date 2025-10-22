/**
 * CommandPalette Component Tests
 * Tests command palette functionality, keyboard navigation, and search
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandPalette } from '@/components/CommandPalette';
import { useRouter } from 'next/navigation';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockPush = jest.fn();
(useRouter as jest.Mock).mockReturnValue({ push: mockPush });

describe('CommandPalette Component', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  test('should not render when closed', () => {
    render(<CommandPalette />);
    
    expect(screen.queryByPlaceholderText(/search commands/i)).not.toBeInTheDocument();
  });

  test('should open on Cmd+K', () => {
    render(<CommandPalette />);
    
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    expect(screen.getByPlaceholderText(/search commands/i)).toBeInTheDocument();
  });

  test('should open on Ctrl+K', () => {
    render(<CommandPalette />);
    
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    expect(screen.getByPlaceholderText(/search commands/i)).toBeInTheDocument();
  });

  test('should close on Escape', () => {
    render(<CommandPalette />);
    
    // Open
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(screen.getByPlaceholderText(/search commands/i)).toBeInTheDocument();

    // Close
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByPlaceholderText(/search commands/i)).not.toBeInTheDocument();
  });

  test('should display all command categories', () => {
    render(<CommandPalette />);
    
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('CLI')).toBeInTheDocument();
  });

  test('should filter commands based on search', () => {
    render(<CommandPalette />);
    
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    const searchInput = screen.getByPlaceholderText(/search commands/i);
    fireEvent.change(searchInput, { target: { value: 'dashboard' } });

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Profile Settings')).not.toBeInTheDocument();
  });

  test('should navigate with arrow keys', () => {
    render(<CommandPalette />);
    
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    // Arrow down should select first command
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    
    const firstCommand = screen.getAllByRole('button')[0];
    expect(firstCommand).toHaveClass('bg-orange-500/10');
  });

  test('should execute command on Enter', async () => {
    render(<CommandPalette />);
    
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    const searchInput = screen.getByPlaceholderText(/search commands/i);
    fireEvent.change(searchInput, { target: { value: 'dashboard' } });

    fireEvent.keyDown(document, { key: 'Enter' });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  test('should execute command on click', async () => {
    render(<CommandPalette />);
    
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    const dashboardCommand = screen.getByText('Dashboard').closest('button');
    fireEvent.click(dashboardCommand!);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  test('should show keyboard shortcuts hints', () => {
    render(<CommandPalette />);
    
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    expect(screen.getByText('Navigate')).toBeInTheDocument();
    expect(screen.getByText('Select')).toBeInTheDocument();
    expect(screen.getByText(/to close/i)).toBeInTheDocument();
  });

  test('should show "no commands found" for invalid search', () => {
    render(<CommandPalette />);
    
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    const searchInput = screen.getByPlaceholderText(/search commands/i);
    fireEvent.change(searchInput, { target: { value: 'xyz123abc' } });

    expect(screen.getByText(/no commands found/i)).toBeInTheDocument();
  });

  test('should close after command execution', async () => {
    render(<CommandPalette />);
    
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    const dashboardCommand = screen.getByText('Dashboard').closest('button');
    fireEvent.click(dashboardCommand!);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search commands/i)).not.toBeInTheDocument();
    });
  });

  test('should reset search on close', () => {
    render(<CommandPalette />);
    
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    const searchInput = screen.getByPlaceholderText(/search commands/i);
    fireEvent.change(searchInput, { target: { value: 'test' } });

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    const newSearchInput = screen.getByPlaceholderText(/search commands/i);
    expect((newSearchInput as HTMLInputElement).value).toBe('');
  });
});
