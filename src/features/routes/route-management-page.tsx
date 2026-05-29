import { useEffect, useState } from 'react';
import type { Route, RouteApi } from '../../lib/tauri/route';
import { tauriRouteApi } from '../../lib/tauri/route';
import { RouteForm } from './route-form';
import { RouteTable } from './route-table';
import './route-management.css';

interface RouteManagementPageProps {
  profileId: string;
  api?: RouteApi;
}

export function RouteManagementPage({ profileId, api = tauriRouteApi }: RouteManagementPageProps) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [busyRouteId, setBusyRouteId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError(false);

    api
      .getRoutes(profileId)
      .then((result) => {
        if (isMounted) setRoutes(result);
      })
      .catch(() => {
        if (isMounted) setLoadError(true);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [api, profileId]);

  const handleAdd = async (hostname: string, target: string) => {
    const route = await api.addRoute({ profileId, hostname, target });
    setRoutes((prev) => [...prev, route]);
    setShowForm(false);
  };

  const handleUpdate = async (hostname: string, target: string) => {
    if (!editingRoute) return;
    const updated = await api.updateRoute({
      id: editingRoute.id,
      profileId,
      hostname,
      target,
    });
    setRoutes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setEditingRoute(null);
    setShowForm(false);
  };

  const handleEdit = (route: Route) => {
    setEditingRoute(route);
    setShowForm(true);
  };

  const handleDelete = async (route: Route) => {
    if (!window.confirm(`Delete route ${route.hostname}?`)) return;
    setBusyRouteId(route.id);
    try {
      await api.deleteRoute(route.id, profileId);
      setRoutes((prev) => prev.filter((r) => r.id !== route.id));
    } finally {
      setBusyRouteId(null);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingRoute(null);
  };

  if (isLoading) {
    return (
      <div className="route-management-page">
        <p className="route-status" role="status">Loading routes...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="route-management-page">
        <p className="route-status route-error" role="status">
          Routes could not be loaded.
        </p>
      </div>
    );
  }

  return (
    <div className="route-management-page">
      <section className="route-header">
        <div>
          <p className="eyebrow">Route management</p>
          <h1>Local routes</h1>
          <p className="route-intro">
            Define which local services to expose on which hostnames. Routes are stored locally and will be synced to Cloudflare tunnels in a future update.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            className="add-route-btn"
            onClick={() => setShowForm(true)}
          >
            Add route
          </button>
        )}
      </section>

      {showForm && (
        <section className="route-form-section">
          <RouteForm
            editingRoute={editingRoute}
            onSubmit={editingRoute ? handleUpdate : handleAdd}
            onCancel={handleCancel}
          />
        </section>
      )}

      <RouteTable
        routes={routes}
        onEdit={handleEdit}
        onDelete={handleDelete}
        busyRouteId={busyRouteId}
      />
    </div>
  );
}
