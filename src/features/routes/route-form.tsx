import { FormEvent, useState } from 'react';
import type { Route } from '../../lib/tauri/route';

interface RouteFormProps {
  editingRoute: Route | null;
  onSubmit: (hostname: string, target: string) => Promise<void>;
  onCancel: () => void;
}

export function RouteForm({ editingRoute, onSubmit, onCancel }: RouteFormProps) {
  const [hostname, setHostname] = useState(editingRoute?.hostname ?? '');
  const [target, setTarget] = useState(editingRoute?.target ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(hostname.trim(), target.trim());
    } catch (caught: unknown) {
      setError(resolveRouteError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="route-form" onSubmit={handleSubmit} aria-label="Route form">
      <label>
        Hostname
        <input
          name="hostname"
          value={hostname}
          placeholder="app.example.com"
          onChange={(e) => setHostname(e.target.value)}
          required
        />
      </label>

      <label>
        Target
        <input
          name="target"
          value={target}
          placeholder="http://localhost:3000"
          onChange={(e) => setTarget(e.target.value)}
          required
        />
      </label>

      {error ? (
        <div className="error-banner" role="alert">
          {error}
        </div>
      ) : null}

      <div className="route-form-actions">
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving...'
            : editingRoute
              ? 'Update route'
              : 'Add route'}
        </button>
        <button type="button" className="cancel-action" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const routeErrorMessages: Record<string, string> = {
  DuplicateHostname: 'This hostname is already used by another route in this profile.',
  InvalidHostname: 'Enter a valid hostname (e.g. app.example.com).',
  InvalidTarget: 'Enter a valid target URL starting with http:// or https://.',
  RouteNotFound: 'This route no longer exists.',
};

function resolveRouteError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    const code = (error as { code: string }).code;
    if (routeErrorMessages[code]) {
      return routeErrorMessages[code];
    }
  }
  return 'Failed to save route. Check the values and try again.';
}
