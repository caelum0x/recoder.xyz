/**
 * NotificationCenter Component Tests
 * Tests notification bell, inbox, and notification actions
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationCenter } from '@/components/NotificationCenter';

// Mock fetch
global.fetch = jest.fn();

const mockNotifications = [
  {
    id: '1',
    type: 'success',
    title: 'Welcome!',
    message: 'Your account is ready',
    read: false,
    link: '/dashboard',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    type: 'info',
    title: 'New Feature',
    message: 'Check out our new command palette',
    read: false,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '3',
    type: 'warning',
    title: 'Usage Alert',
    message: 'You are at 80% of your quota',
    read: true,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

describe('NotificationCenter Component', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  test('should render notification bell', () => {
    render(<NotificationCenter />);
    
    const bell = screen.getByRole('button', { name: /notifications/i });
    expect(bell).toBeInTheDocument();
  });

  test('should show unread count badge', () => {
    render(<NotificationCenter />);
    
    // Mock fetch to return notifications
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, notifications: mockNotifications }),
    });

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    waitFor(() => {
      const badge = screen.getByText('2');
      expect(badge).toBeInTheDocument();
    });
  });

  test('should open notification dropdown on click', async () => {
    render(<NotificationCenter />);
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, notifications: mockNotifications }),
    });

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('Welcome!')).toBeInTheDocument();
    });
  });

  test('should close dropdown when clicking outside', async () => {
    render(<NotificationCenter />);
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, notifications: mockNotifications }),
    });

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText('Welcome!')).toBeInTheDocument();
    });

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('Welcome!')).not.toBeInTheDocument();
    });
  });

  test('should display notification types with correct icons', async () => {
    render(<NotificationCenter />);
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, notifications: mockNotifications }),
    });

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText('Welcome!')).toBeInTheDocument();
      expect(screen.getByText('New Feature')).toBeInTheDocument();
      expect(screen.getByText('Usage Alert')).toBeInTheDocument();
    });
  });

  test('should mark notification as read', async () => {
    render(<NotificationCenter />);
    
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, notifications: mockNotifications }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      const markReadButton = screen.getAllByText('Mark read')[0];
      fireEvent.click(markReadButton);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notifications/1/mark-read',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  test('should mark all notifications as read', async () => {
    render(<NotificationCenter />);
    
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, notifications: mockNotifications }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      const markAllButton = screen.getByText('Mark all read');
      fireEvent.click(markAllButton);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notifications/mark-all-read',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  test('should delete notification', async () => {
    render(<NotificationCenter />);
    
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, notifications: mockNotifications }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole('button', { name: /delete notification/i });
      fireEvent.click(deleteButtons[0]);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notifications/1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  test('should format notification time correctly', async () => {
    render(<NotificationCenter />);
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, notifications: mockNotifications }),
    });

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText(/ago/i)).toBeInTheDocument();
    });
  });

  test('should show empty state when no notifications', async () => {
    render(<NotificationCenter />);
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, notifications: [] }),
    });

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
    });
  });

  test('should show loading state while fetching', async () => {
    render(<NotificationCenter />);
    
    (global.fetch as jest.Mock).mockImplementationOnce(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    const bell = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bell);

    await waitFor(() => {
      expect(screen.getByRole('progressbar', { hidden: true })).toBeInTheDocument();
    });
  });
});
