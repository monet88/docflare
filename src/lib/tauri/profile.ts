import { invoke } from '@tauri-apps/api/core';

export interface ValidateAndSaveProfileInput {
  profileId?: string;
  profileName?: string;
  apiToken: string;
  accountId: string;
  zoneId: string;
}

export interface SavedProfiles {
  profiles: SavedProfile[];
}

export interface SavedProfile {
  profileKey: string;
  profileId: string;
  displayName: string;
  accountId: string;
  zoneId: string;
  tokenPresent: boolean;
  lastValidatedAt: string;
  isActive: boolean;
}

export interface ProfileError {
  code: string;
  message: string;
}

export interface ProfileApi {
  getProfile(): Promise<SavedProfile | null>;
  getProfiles(): Promise<SavedProfiles>;
  validateAndSaveProfile(input: ValidateAndSaveProfileInput): Promise<SavedProfile>;
  setActiveProfile(profileKey: string): Promise<SavedProfiles>;
  deleteProfile(profileKey: string): Promise<SavedProfiles>;
}

export const tauriProfileApi: ProfileApi = {
  getProfile() {
    if (!isTauriRuntime()) {
      return Promise.resolve(null);
    }

    return invoke<SavedProfile | null>('get_profile');
  },
  getProfiles() {
    if (!isTauriRuntime()) {
      return Promise.resolve({ profiles: [] });
    }

    return invoke<SavedProfiles>('get_profiles');
  },
  validateAndSaveProfile(input) {
    return invoke<SavedProfile>('validate_and_save_profile', { input });
  },
  setActiveProfile(profileKey) {
    return invoke<SavedProfiles>('set_active_profile', { profileId: profileKey });
  },
  deleteProfile(profileKey) {
    return invoke<SavedProfiles>('delete_profile', { profileId: profileKey });
  },
};

function isTauriRuntime() {
  return '__TAURI_INTERNALS__' in window;
}
