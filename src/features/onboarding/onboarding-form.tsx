import { FormEvent, useState } from 'react';
import type { ProfileApi, ProfileError, SavedProfile } from '../../lib/tauri/profile';
import { tauriProfileApi } from '../../lib/tauri/profile';
import { SavedProfileCard } from './saved-profile-card';

const initialFields = {
  profileName: '',
  apiToken: '',
  accountId: '',
  zoneId: '',
};

const errorMessages: Record<string, string> = {
  InvalidInput: 'Enter an API token, account ID, and zone ID.',
  InvalidToken: 'Cloudflare rejected this API token.',
  AccountNotAccessible: 'This token cannot access the submitted account.',
  ZoneNotFoundOrMismatch: 'This zone was not found under the submitted account.',
  InsufficientPermissions: 'This token is missing required DNS or tunnel permissions.',
  CloudflareRateLimited: 'Cloudflare rate limited validation. Try again later.',
  CloudflareUnavailable: 'Cloudflare could not be reached. Try again later.',
  SecretStoreUnavailable: 'The OS credential store is unavailable.',
  ConfigWriteFailed: 'The local profile config could not be saved.',
};

interface OnboardingFormProps {
  api?: ProfileApi;
  profiles?: SavedProfile[];
  isProfileLoading?: boolean;
  onProfilesChanged?: (profiles: SavedProfile[]) => void;
}

export function OnboardingForm({
  api = tauriProfileApi,
  profiles = [],
  isProfileLoading = false,
  onProfilesChanged,
}: OnboardingFormProps) {
  const [fields, setFields] = useState(initialFields);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);

  const activeProfile = profiles.find((profile) => profile.isActive) ?? null;

  const updateField = (name: keyof typeof fields, value: string) => {
    setFields((current) => ({ ...current, [name]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const input = {
      profileName: fields.profileName.trim() || undefined,
      apiToken: fields.apiToken.trim(),
      accountId: fields.accountId.trim(),
      zoneId: fields.zoneId.trim(),
    };

    if (!input.apiToken || !input.accountId || !input.zoneId) {
      setError(errorMessages.InvalidInput);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const profile = await api.validateAndSaveProfile(input);
      setFields(initialFields);
      onProfilesChanged?.([...profiles.filter((item) => item.profileKey !== profile.profileKey).map((item) => ({ ...item, isActive: false })), profile]);
    } catch (caught: unknown) {
      setError(resolveErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const setActiveProfile = async (profileKey: string) => {
    setBusyProfileId(profileKey);
    setError(null);

    try {
      const result = await api.setActiveProfile(profileKey);
      onProfilesChanged?.(result.profiles);
    } catch (caught: unknown) {
      setError(resolveErrorMessage(caught));
    } finally {
      setBusyProfileId(null);
    }
  };

  const deleteProfile = async (profileKey: string) => {
    if (!window.confirm('Delete this Cloudflare profile from local metadata and the OS credential manager?')) {
      return;
    }

    setBusyProfileId(profileKey);
    setError(null);

    try {
      const result = await api.deleteProfile(profileKey);
      onProfilesChanged?.(result.profiles);
    } catch (caught: unknown) {
      setError(resolveErrorMessage(caught));
    } finally {
      setBusyProfileId(null);
    }
  };

  return (
    <div className="onboarding-shell">
      <section className="setup-overview" aria-labelledby="onboarding-heading">
        <p className="eyebrow">Docflare setup</p>
        <h1 id="onboarding-heading">Connect Cloudflare safely</h1>
        <p className="form-intro">
          Save one or more Cloudflare profiles, then choose which account and zone Docflare should use for future tunnels.
        </p>

        <div className="setup-card" aria-label="Onboarding requirements">
          <div>
            <span className="step-number">1</span>
            <p>Use a scoped API token, not a global key.</p>
          </div>
          <div>
            <span className="step-number">2</span>
            <p>Add every account and zone you want to switch between.</p>
          </div>
          <div>
            <span className="step-number">3</span>
            <p>Docflare stores only metadata locally and keeps tokens out of config.</p>
          </div>
        </div>
      </section>

      <section className="connection-card" aria-labelledby="connection-heading">
        <div className="card-header">
          <div>
            <p className="eyebrow">Connection profile</p>
            <h2 id="connection-heading">Add Cloudflare profile</h2>
          </div>
          <span className={activeProfile ? 'status-pill is-ready' : 'status-pill'}>
            {activeProfile ? 'Ready' : 'Required'}
          </span>
        </div>

        <form className="onboarding-form" onSubmit={submit} aria-label="Cloudflare profile onboarding">
          <label>
            Profile name
            <input
              name="profileName"
              value={fields.profileName}
              placeholder="Production, staging, client A"
              onChange={(event) => updateField('profileName', event.target.value)}
            />
          </label>

          <label>
            API token
            <input
              name="apiToken"
              type="password"
              autoComplete="off"
              value={fields.apiToken}
              onChange={(event) => updateField('apiToken', event.target.value)}
            />
          </label>

          <div className="field-row">
            <label>
              Account ID
              <input
                name="accountId"
                value={fields.accountId}
                onChange={(event) => updateField('accountId', event.target.value)}
              />
            </label>

            <label>
              Zone ID
              <input
                name="zoneId"
                value={fields.zoneId}
                onChange={(event) => updateField('zoneId', event.target.value)}
              />
            </label>
          </div>

          {error ? (
            <div className="error-banner" role="alert">
              {error}
            </div>
          ) : null}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Testing connection...' : 'Test connection and save'}
          </button>
        </form>

        <p className="permission-note">
          Required token permissions: Account Connectivity Directory Edit, Zone DNS Edit, and Zone Read.
        </p>
      </section>

      <aside className="profile-panel" aria-label="Saved profile status">
        {isProfileLoading ? (
          <div className="empty-profile-card">
            <p className="eyebrow">Checking local profiles</p>
            <h2>Loading saved metadata</h2>
            <p>Docflare is reading local profile config without exposing stored tokens.</p>
          </div>
        ) : profiles.length > 0 ? (
          <section className="saved-profile-list" aria-labelledby="saved-profiles-heading">
            <p className="eyebrow">Saved profiles</p>
            <h2 id="saved-profiles-heading">Cloudflare profiles</h2>
            <p className="saved-profile-summary">
              Switch the active profile before route and tunnel operations. Tokens stay in the OS credential manager.
            </p>
            <div className="profile-list-items">
              {profiles.map((profile) => (
                <SavedProfileCard
                  key={profile.profileKey}
                  profile={profile}
                  isBusy={busyProfileId === profile.profileKey}
                  onSetActive={setActiveProfile}
                  onDelete={deleteProfile}
                />
              ))}
            </div>
          </section>
        ) : (
          <div className="empty-profile-card">
            <p className="eyebrow">Waiting for validation</p>
            <h2>No profile saved yet</h2>
            <p>After a successful check, this panel shows only masked metadata and token presence.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function resolveErrorMessage(error: unknown) {
  if (isProfileError(error) && errorMessages[error.code]) {
    return errorMessages[error.code];
  }

  return 'Profile validation failed. Check the submitted values and try again.';
}

function isProfileError(error: unknown): error is ProfileError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}
