import { useEffect, useState } from 'react';
import type { ProfileApi, SavedProfile } from '../../lib/tauri/profile';
import { tauriProfileApi } from '../../lib/tauri/profile';
import { OnboardingForm } from './onboarding-form';
import './onboarding.css';

interface OnboardingPageProps {
  api?: ProfileApi;
}

export function OnboardingPage({ api = tauriProfileApi }: OnboardingPageProps) {
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingProfile(true);
    setLoadError(false);

    api
      .getProfiles()
      .then((result) => {
        if (isMounted) {
          setProfiles(result.profiles);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingProfile(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [api]);

  return (
    <main className="onboarding-page">
      {loadError ? (
        <p className="load-profile-status" role="status">
          Saved profiles could not be loaded. Validate a connection again to refresh local metadata.
        </p>
      ) : null}
      <OnboardingForm
        api={api}
        profiles={profiles}
        isProfileLoading={isLoadingProfile}
        onProfilesChanged={setProfiles}
      />
    </main>
  );
}
