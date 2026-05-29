import type { Route } from '../../lib/tauri/route';

interface RouteTableProps {
  routes: Route[];
  onEdit: (route: Route) => void;
  onDelete: (route: Route) => void;
  busyRouteId: string | null;
}

export function RouteTable({ routes, onEdit, onDelete, busyRouteId }: RouteTableProps) {
  if (routes.length === 0) {
    return (
      <div className="empty-route-card">
        <p className="eyebrow">No routes yet</p>
        <h2>Add your first route</h2>
        <p>Define which local service to expose on which hostname.</p>
      </div>
    );
  }

  return (
    <div className="route-list" role="list" aria-label="Route list">
      {routes.map((route) => (
        <div key={route.id} className="route-card" role="listitem">
          <div className="route-card-header">
            <div>
              <dt className="route-label">Hostname</dt>
              <dd className="route-value route-hostname">{route.hostname}</dd>
            </div>
            <div>
              <dt className="route-label">Target</dt>
              <dd className="route-value">{route.target}</dd>
            </div>
          </div>
          <div className="route-actions">
            <button
              type="button"
              onClick={() => onEdit(route)}
              disabled={busyRouteId === route.id}
            >
              Edit
            </button>
            <button
              type="button"
              className="danger-action"
              onClick={() => onDelete(route)}
              disabled={busyRouteId === route.id}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
