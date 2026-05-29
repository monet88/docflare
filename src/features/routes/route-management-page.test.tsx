import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { Route, RouteApi } from '../../lib/tauri/route';
import { RouteManagementPage } from './route-management-page';

const route1: Route = {
  id: 'r1',
  profileId: 'profile-1',
  hostname: 'app.example.com',
  target: 'http://localhost:3000',
  createdAt: '2026-05-29T00:00:00Z',
};

const route2: Route = {
  id: 'r2',
  profileId: 'profile-1',
  hostname: 'api.example.com',
  target: 'http://localhost:4000',
  createdAt: '2026-05-29T01:00:00Z',
};

function mockRouteApi(overrides: Partial<RouteApi> = {}): RouteApi {
  return {
    getRoutes: vi.fn(async () => [route1, route2]),
    addRoute: vi.fn(async (input) => ({
      id: 'r-new',
      profileId: input.profileId,
      hostname: input.hostname,
      target: input.target,
      createdAt: '2026-05-29T02:00:00Z',
    })),
    updateRoute: vi.fn(async (input) => ({
      id: input.id,
      profileId: input.profileId,
      hostname: input.hostname,
      target: input.target,
      createdAt: '2026-05-29T00:00:00Z',
    })),
    deleteRoute: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('RouteManagementPage', () => {
  test('renders route list after loading', async () => {
    const api = mockRouteApi();
    render(<RouteManagementPage profileId="profile-1" api={api} />);

    expect(await screen.findByText('app.example.com')).toBeInTheDocument();
    expect(screen.getByText('api.example.com')).toBeInTheDocument();
    expect(api.getRoutes).toHaveBeenCalledWith('profile-1');
  });

  test('shows empty state when no routes', async () => {
    const api = mockRouteApi({ getRoutes: vi.fn(async () => []) });
    render(<RouteManagementPage profileId="profile-1" api={api} />);

    expect(await screen.findByText('Add your first route')).toBeInTheDocument();
  });

  test('shows error state on load failure', async () => {
    const api = mockRouteApi({
      getRoutes: vi.fn(async () => { throw new Error('fail'); }),
    });
    render(<RouteManagementPage profileId="profile-1" api={api} />);

    expect(await screen.findByText('Routes could not be loaded.')).toBeInTheDocument();
  });

  test('adds a new route', async () => {
    const user = userEvent.setup();
    const api = mockRouteApi({ getRoutes: vi.fn(async () => []) });
    render(<RouteManagementPage profileId="profile-1" api={api} />);

    await screen.findByText('Add your first route');
    await user.click(screen.getByRole('button', { name: 'Add route' }));

    await user.type(screen.getByLabelText('Hostname'), 'new.example.com');
    await user.type(screen.getByLabelText('Target'), 'http://localhost:5000');
    await user.click(screen.getByRole('button', { name: 'Add route' }));

    await waitFor(() => {
      expect(api.addRoute).toHaveBeenCalledWith({
        profileId: 'profile-1',
        hostname: 'new.example.com',
        target: 'http://localhost:5000',
      });
    });

    expect(await screen.findByText('new.example.com')).toBeInTheDocument();
  });

  test('edits an existing route', async () => {
    const user = userEvent.setup();
    const api = mockRouteApi();
    render(<RouteManagementPage profileId="profile-1" api={api} />);

    await screen.findByText('app.example.com');
    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    await user.click(editButtons[0]);

    const hostnameInput = screen.getByLabelText('Hostname');
    await user.clear(hostnameInput);
    await user.type(hostnameInput, 'updated.example.com');
    await user.click(screen.getByRole('button', { name: 'Update route' }));

    await waitFor(() => {
      expect(api.updateRoute).toHaveBeenCalledWith({
        id: 'r1',
        profileId: 'profile-1',
        hostname: 'updated.example.com',
        target: 'http://localhost:3000',
      });
    });
  });

  test('deletes a route after confirmation', async () => {
    const user = userEvent.setup();
    const api = mockRouteApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<RouteManagementPage profileId="profile-1" api={api} />);

    await screen.findByText('app.example.com');
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(api.deleteRoute).toHaveBeenCalledWith('r1', 'profile-1');
    });

    vi.restoreAllMocks();
  });

  test('shows DuplicateHostname error in form', async () => {
    const user = userEvent.setup();
    const api = mockRouteApi({
      getRoutes: vi.fn(async () => []),
      addRoute: vi.fn(async () => {
        throw { code: 'DuplicateHostname', message: 'duplicate' };
      }),
    });
    render(<RouteManagementPage profileId="profile-1" api={api} />);

    await screen.findByText('Add your first route');
    await user.click(screen.getByRole('button', { name: 'Add route' }));

    await user.type(screen.getByLabelText('Hostname'), 'dup.example.com');
    await user.type(screen.getByLabelText('Target'), 'http://localhost:3000');
    await user.click(screen.getByRole('button', { name: 'Add route' }));

    expect(
      await screen.findByText('This hostname is already used by another route in this profile.'),
    ).toBeInTheDocument();
  });

  test('shows InvalidHostname error in form', async () => {
    const user = userEvent.setup();
    const api = mockRouteApi({
      getRoutes: vi.fn(async () => []),
      addRoute: vi.fn(async () => {
        throw { code: 'InvalidHostname', message: 'invalid' };
      }),
    });
    render(<RouteManagementPage profileId="profile-1" api={api} />);

    await screen.findByText('Add your first route');
    await user.click(screen.getByRole('button', { name: 'Add route' }));

    await user.type(screen.getByLabelText('Hostname'), 'bad');
    await user.type(screen.getByLabelText('Target'), 'http://localhost:3000');
    await user.click(screen.getByRole('button', { name: 'Add route' }));

    expect(
      await screen.findByText('Enter a valid hostname (e.g. app.example.com).'),
    ).toBeInTheDocument();
  });

  test('shows InvalidTarget error in form', async () => {
    const user = userEvent.setup();
    const api = mockRouteApi({
      getRoutes: vi.fn(async () => []),
      addRoute: vi.fn(async () => {
        throw { code: 'InvalidTarget', message: 'invalid' };
      }),
    });
    render(<RouteManagementPage profileId="profile-1" api={api} />);

    await screen.findByText('Add your first route');
    await user.click(screen.getByRole('button', { name: 'Add route' }));

    await user.type(screen.getByLabelText('Hostname'), 'app.example.com');
    await user.type(screen.getByLabelText('Target'), 'ftp://bad');
    await user.click(screen.getByRole('button', { name: 'Add route' }));

    expect(
      await screen.findByText('Enter a valid target URL starting with http:// or https://.'),
    ).toBeInTheDocument();
  });
});
