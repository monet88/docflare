import { invoke } from '@tauri-apps/api/core';

export interface Route {
  id: string;
  profileId: string;
  hostname: string;
  target: string;
  createdAt: string;
}

export interface CreateRouteInput {
  profileId: string;
  hostname: string;
  target: string;
}

export interface UpdateRouteInput {
  id: string;
  profileId: string;
  hostname: string;
  target: string;
}

export interface RouteError {
  code: string;
  message: string;
}

export interface RouteApi {
  getRoutes(profileId: string): Promise<Route[]>;
  addRoute(input: CreateRouteInput): Promise<Route>;
  updateRoute(input: UpdateRouteInput): Promise<Route>;
  deleteRoute(routeId: string, profileId: string): Promise<void>;
}

export const tauriRouteApi: RouteApi = {
  getRoutes(profileId) {
    return invoke<Route[]>('get_routes', { profileId });
  },
  addRoute(input) {
    return invoke<Route>('add_route', { input });
  },
  updateRoute(input) {
    return invoke<Route>('update_route', { input });
  },
  deleteRoute(routeId, profileId) {
    return invoke<void>('delete_route', { routeId, profileId });
  },
};
