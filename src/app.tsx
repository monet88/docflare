import { useEffect, useState } from 'react';
import { OnboardingPage } from './features/onboarding/onboarding-page';
import { RouteManagementPage } from './features/routes/route-management-page';
import { tauriProfileApi } from './lib/tauri/profile';

type Tab = 'profiles' | 'routes';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('profiles');
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  useEffect(() => {
    tauriProfileApi.getProfile().then((profile) => {
      if (profile) setActiveProfileId(profile.profileKey);
    });
  }, []);

  return (
    <div className="app-shell">
      <nav className="app-tab-bar" aria-label="Main navigation">
        <button
          type="button"
          className={activeTab === 'profiles' ? 'tab-btn is-active' : 'tab-btn'}
          onClick={() => setActiveTab('profiles')}
        >
          Profiles
        </button>
        <button
          type="button"
          className={activeTab === 'routes' ? 'tab-btn is-active' : 'tab-btn'}
          onClick={() => setActiveTab('routes')}
          disabled={!activeProfileId}
        >
          Routes
        </button>
      </nav>

      {activeTab === 'profiles' && <OnboardingPage />}
      {activeTab === 'routes' && activeProfileId && (
        <RouteManagementPage profileId={activeProfileId} />
      )}
    </div>
  );
}
