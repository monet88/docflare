import type { SavedProfile } from './onboarding-types';

interface SavedProfileCardProps {
  profile: SavedProfile;
  isBusy?: boolean;
  onSetActive: (profileKey: string) => void;
  onDelete: (profileKey: string) => void;
}

export function SavedProfileCard({ profile, isBusy = false, onSetActive, onDelete }: SavedProfileCardProps) {
  return (
    <article className={profile.isActive ? 'saved-profile-card is-active' : 'saved-profile-card'}>
      <div className="saved-profile-heading-row">
        <div>
          <p className="eyebrow">{profile.isActive ? 'Active profile' : 'Saved profile'}</p>
          <h3>{profile.displayName}</h3>
        </div>
        <span className={profile.isActive ? 'status-pill is-ready' : 'status-pill'}>
          {profile.isActive ? 'Active' : 'Standby'}
        </span>
      </div>

      <dl>
        <div>
          <dt>Profile ID</dt>
          <dd>{profile.profileId}</dd>
        </div>
        <div>
          <dt>Account ID</dt>
          <dd>{profile.accountId}</dd>
        </div>
        <div>
          <dt>Zone ID</dt>
          <dd>{profile.zoneId}</dd>
        </div>
        <div>
          <dt>Token</dt>
          <dd>{profile.tokenPresent ? 'Stored in OS credential manager' : 'Not stored'}</dd>
        </div>
        <div>
          <dt>Last validated</dt>
          <dd>
            <time dateTime={profile.lastValidatedAt}>{formatValidationTime(profile.lastValidatedAt)}</time>
          </dd>
        </div>
      </dl>

      <div className="profile-actions">
        <button type="button" disabled={profile.isActive || isBusy} onClick={() => onSetActive(profile.profileKey)}>
          Set active
        </button>
        <button type="button" className="danger-action" disabled={isBusy} onClick={() => onDelete(profile.profileKey)}>
          Delete
        </button>
      </div>
    </article>
  );
}

function formatValidationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently validated';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
