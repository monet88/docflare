import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ProfileApi, SavedProfile, SavedProfiles } from '../../lib/tauri/profile';
import { OnboardingForm } from './onboarding-form';
import { OnboardingPage } from './onboarding-page';

const rawAccountId = '1234567890abcdef1234567890abcdef';
const rawZoneId = 'abcdef1234567890abcdef1234567890';

const savedProfile: SavedProfile = {
  profileKey: 'production',
  profileId: 'prod…tion',
  displayName: 'Production',
  accountId: '1234…cdef',
  zoneId: 'abcd…7890',
  tokenPresent: true,
  lastValidatedAt: '2026-05-29T00:00:00Z',
  isActive: true,
};

const stagingProfile: SavedProfile = {
  profileKey: 'staging',
  profileId: 'stag…ging',
  displayName: 'Staging',
  accountId: 'aaaa…aaaa',
  zoneId: 'bbbb…bbbb',
  tokenPresent: true,
  lastValidatedAt: '2026-05-29T01:00:00Z',
  isActive: false,
};

function profileResult(profiles: SavedProfile[]): SavedProfiles {
  return { profiles };
}

function profileApi(overrides: Partial<ProfileApi> = {}): ProfileApi {
  return {
    getProfile: vi.fn(async () => null),
    getProfiles: vi.fn(async () => profileResult([])),
    validateAndSaveProfile: vi.fn(async () => savedProfile),
    setActiveProfile: vi.fn(async () => profileResult([inactive(savedProfile), active(stagingProfile)])),
    deleteProfile: vi.fn(async () => profileResult([active(stagingProfile)])),
    ...overrides,
  };
}

function active(profile: SavedProfile): SavedProfile {
  return { ...profile, isActive: true };
}

function inactive(profile: SavedProfile): SavedProfile {
  return { ...profile, isActive: false };
}

function placeholderApiToken() {
  return ['test', 'token', 'placeholder'].join('-');
}

function StatefulOnboardingForm({ api, initialProfiles = [] }: { api: ProfileApi; initialProfiles?: SavedProfile[] }) {
  const [profiles, setProfiles] = useState<SavedProfile[]>(initialProfiles);
  return <OnboardingForm api={api} profiles={profiles} onProfilesChanged={setProfiles} />;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OnboardingForm', () => {
  test('blocks empty submit before invoking backend', async () => {
    const api = profileApi();
    const user = userEvent.setup();

    render(<StatefulOnboardingForm api={api} />);
    await user.click(screen.getByRole('button', { name: /test connection/i }));

    expect(api.validateAndSaveProfile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an API token');
  });

  test('disables duplicate submit while pending', async () => {
    let resolveSave: (profile: SavedProfile) => void = () => undefined;
    const api = profileApi({
      validateAndSaveProfile: vi.fn(
        () =>
          new Promise<SavedProfile>((resolve) => {
            resolveSave = resolve;
          }),
      ),
    });
    const user = userEvent.setup();

    render(<StatefulOnboardingForm api={api} />);
    await user.type(screen.getByLabelText(/api token/i), 'token');
    await user.type(screen.getByLabelText(/account id/i), rawAccountId);
    await user.type(screen.getByLabelText(/zone id/i), rawZoneId);
    await user.click(screen.getByRole('button', { name: /test connection/i }));

    expect(screen.getByRole('button', { name: /testing connection/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /testing connection/i }));
    expect(api.validateAndSaveProfile).toHaveBeenCalledTimes(1);

    resolveSave(savedProfile);
    expect(await screen.findByRole('heading', { name: /Cloudflare profiles/i })).toBeInTheDocument();
  });

  test('clears token and renders masked profile after success', async () => {
    const api = profileApi();
    const user = userEvent.setup();

    render(<StatefulOnboardingForm api={api} />);
    await user.type(screen.getByLabelText(/profile name/i), 'Production');
    await user.type(screen.getByLabelText(/api token/i), placeholderApiToken());
    await user.type(screen.getByLabelText(/account id/i), rawAccountId);
    await user.type(screen.getByLabelText(/zone id/i), rawZoneId);
    await user.click(screen.getByRole('button', { name: /test connection/i }));

    expect(await screen.findByRole('heading', { name: /Cloudflare profiles/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/api token/i)).toHaveValue('');
    expect(screen.queryByText(placeholderApiToken())).not.toBeInTheDocument();
    expect(screen.queryByText(rawAccountId)).not.toBeInTheDocument();
    expect(screen.queryByText(rawZoneId)).not.toBeInTheDocument();
    expect(screen.getByText('1234…cdef')).toBeInTheDocument();
    expect(screen.getByText(/Stored in OS credential manager/i)).toBeInTheDocument();
    expect(api.validateAndSaveProfile).toHaveBeenCalledWith({
      profileName: 'Production',
      apiToken: placeholderApiToken(),
      accountId: rawAccountId,
      zoneId: rawZoneId,
    });
  });

  test('renders saved profile list and switches active profile', async () => {
    const api = profileApi();
    const user = userEvent.setup();

    render(<StatefulOnboardingForm api={api} initialProfiles={[savedProfile, stagingProfile]} />);
    const stagingCard = screen.getByText('Staging').closest('article');
    expect(stagingCard).not.toBeNull();
    await user.click(within(stagingCard as HTMLElement).getByRole('button', { name: /set active/i }));

    expect(api.setActiveProfile).toHaveBeenCalledWith('staging');
    await waitFor(() => expect(within(stagingCard as HTMLElement).getByText('Active')).toBeInTheDocument());
  });

  test('confirms before deleting a profile', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = profileApi();
    const user = userEvent.setup();

    render(<StatefulOnboardingForm api={api} initialProfiles={[savedProfile, stagingProfile]} />);
    const productionCard = screen.getByText('Production').closest('article');
    expect(productionCard).not.toBeNull();
    await user.click(within(productionCard as HTMLElement).getByRole('button', { name: /delete/i }));

    expect(api.deleteProfile).toHaveBeenCalledWith('production');
    await waitFor(() => expect(screen.queryByText('Production')).not.toBeInTheDocument());
    expect(screen.getByText('Staging')).toBeInTheDocument();
  });

  test('does not delete when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = profileApi();
    const user = userEvent.setup();

    render(<StatefulOnboardingForm api={api} initialProfiles={[savedProfile]} />);
    const productionCard = screen.getByText('Production').closest('article');
    expect(productionCard).not.toBeNull();
    await user.click(within(productionCard as HTMLElement).getByRole('button', { name: /delete/i }));

    expect(api.deleteProfile).not.toHaveBeenCalled();
    expect(screen.getByText('Production')).toBeInTheDocument();
  });

  test('renders typed backend errors without provider details', async () => {
    const api = profileApi({
      validateAndSaveProfile: vi.fn(async () => {
        throw { code: 'InvalidToken', message: 'provider detail' };
      }),
    });
    const user = userEvent.setup();

    render(<StatefulOnboardingForm api={api} />);
    await user.type(screen.getByLabelText(/api token/i), 'bad-token');
    await user.type(screen.getByLabelText(/account id/i), rawAccountId);
    await user.type(screen.getByLabelText(/zone id/i), rawZoneId);
    await user.click(screen.getByRole('button', { name: /test connection/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cloudflare rejected this API token');
    expect(screen.queryByText('provider detail')).not.toBeInTheDocument();
  });

  test('uses a safe fallback for unknown backend errors', async () => {
    const api = profileApi({
      validateAndSaveProfile: vi.fn(async () => {
        throw { message: 'internal provider payload' };
      }),
    });
    const user = userEvent.setup();

    render(<StatefulOnboardingForm api={api} />);
    await user.type(screen.getByLabelText(/api token/i), 'bad-token');
    await user.type(screen.getByLabelText(/account id/i), rawAccountId);
    await user.type(screen.getByLabelText(/zone id/i), rawZoneId);
    await user.click(screen.getByRole('button', { name: /test connection/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Profile validation failed');
    expect(screen.queryByText('internal provider payload')).not.toBeInTheDocument();
  });

  test('loads saved profile metadata on startup', async () => {
    const api = profileApi({ getProfiles: vi.fn(async () => profileResult([savedProfile])) });

    render(<OnboardingPage api={api} />);

    expect(await screen.findByRole('heading', { name: /Cloudflare profiles/i })).toBeInTheDocument();
    expect(api.getProfiles).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText(/Loading saved metadata/i)).not.toBeInTheDocument());
    expect(screen.queryByText(rawAccountId)).not.toBeInTheDocument();
  });

  test('uses password-style token input without autocomplete', () => {
    render(<StatefulOnboardingForm api={profileApi()} />);

    expect(screen.getByLabelText(/api token/i)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/api token/i)).toHaveAttribute('autocomplete', 'off');
  });
});
