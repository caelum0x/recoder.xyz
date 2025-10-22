/**
 * ThemeToggle Component Tests
 * Tests theme toggle button UI and interactions
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ThemeProvider } from '@/components/ThemeProvider';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(() => 'dark'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

const renderWithThemeProvider = (component: React.ReactElement) => {
  return render(<ThemeProvider>{component}</ThemeProvider>);
};

describe('ThemeToggle Component', () => {
  beforeEach(() => {
    localStorageMock.getItem.mockReturnValue('dark');
    localStorageMock.setItem.mockClear();
  });

  test('should render theme toggle button', () => {
    renderWithThemeProvider(<ThemeToggle />);
    
    const button = screen.getByRole('button', { name: /toggle theme/i });
    expect(button).toBeInTheDocument();
  });

  test('should show theme menu on click', async () => {
    renderWithThemeProvider(<ThemeToggle />);
    
    const button = screen.getByRole('button', { name: /toggle theme/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Light')).toBeInTheDocument();
      expect(screen.getByText('Dark')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  test('should close menu when clicking outside', async () => {
    renderWithThemeProvider(<ThemeToggle />);
    
    const button = screen.getByRole('button', { name: /toggle theme/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Light')).toBeInTheDocument();
    });

    // Click outside
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('Light')).not.toBeInTheDocument();
    });
  });

  test('should change theme when selecting option', async () => {
    renderWithThemeProvider(<ThemeToggle />);
    
    const button = screen.getByRole('button', { name: /toggle theme/i });
    fireEvent.click(button);

    await waitFor(() => {
      const lightOption = screen.getByText('Light');
      fireEvent.click(lightOption);
    });

    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith('recoder-theme', 'light');
    });
  });

  test('should highlight current theme', async () => {
    localStorageMock.getItem.mockReturnValue('dark');
    
    renderWithThemeProvider(<ThemeToggle />);
    
    const button = screen.getByRole('button', { name: /toggle theme/i });
    fireEvent.click(button);

    await waitFor(() => {
      const darkOption = screen.getByText('Dark').closest('button');
      expect(darkOption).toHaveClass('text-orange-500');
    });
  });

  test('should show loading state before mounted', () => {
    const { container } = renderWithThemeProvider(<ThemeToggle />);
    
    // Check for skeleton loader
    const skeleton = container.querySelector('.animate-pulse');
    expect(skeleton).toBeInTheDocument();
  });
});
