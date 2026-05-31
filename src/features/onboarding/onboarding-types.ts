import type { ProfileError, SavedProfile, SavedProfiles, ValidateAndSaveProfileInput } from '../../lib/tauri/profile';

export type { ProfileError, SavedProfile, SavedProfiles, ValidateAndSaveProfileInput };

export type OnboardingStatus = 'idle' | 'loading' | 'success' | 'error';
