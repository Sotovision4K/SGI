/**
 * Test: LandingPage redirects authenticated users to /processes
 *
 * Bug: After Cognito OIDC callback completes at the root URL (/),
 * the LandingPage renders but doesn't redirect to /processes.
 * Users see the landing page instead of their dashboard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-oidc-context', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { useAuth } from 'react-oidc-context';
import { LandingPage } from '../components/landing/LandingPage';

describe('LandingPage — auth redirect', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    vi.mocked(useAuth).mockReset();
  });

  it('redirects to /processes when user is authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as ReturnType<typeof useAuth>);

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).toHaveBeenCalledWith('/processes', { replace: true });
  });

  it('does NOT redirect when user is not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    } as ReturnType<typeof useAuth>);

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does NOT redirect while auth is still loading', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    } as ReturnType<typeof useAuth>);

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects when user becomes authenticated (after loading)', () => {
    // Start as loading
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    } as ReturnType<typeof useAuth>);

    const { rerender } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(mockNavigate).not.toHaveBeenCalled();

    // Transition to authenticated (simulating OIDC callback completing at root)
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    } as ReturnType<typeof useAuth>);
    rerender(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(mockNavigate).toHaveBeenCalledWith('/processes', { replace: true });
  });
});
