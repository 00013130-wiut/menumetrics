'use client';

// logs/page.js — the audit trail. Shows the latest 200 activity_logs rows for
// this restaurant (who did what, when). Rows are written by lib/activity.js
// whenever something is created, edited, deleted, imported or seeded.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useApp } from '@/lib/AppContext';
import { formatDateTime } from '@/lib/format';

const ACTION_BADGE = {
  create: 'badge-star',
  edit: 'badge-puzzle',
  import: 'badge-puzzle',
  simulate: 'badge-puzzle',
  seed: 'badge-puzzle',
  update: 'badge-puzzle',
  delete: 'badge-dog',
};

export default function LogsPage() {
  const { profile, restaurant } = useApp();
  const restaurantId = profile?.restaurant_id;
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('activity_logs')
      .select('id, user_email, action, entity, detail, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) setError(err.message);
    else setLogs(data || []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity Logs</h1>
          <div className="subtitle">
            Audit trail — latest 200 actions · {restaurant?.name}
          </div>
        </div>
        <button className="btn btn-sm" onClick={load}>
          ↻ Refresh
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {loading ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : logs.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📜</div>
            <p>No activity yet. Actions like adding dishes or importing sales appear here.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(l.created_at)}</td>
                    <td className="faint">{l.user_email || '—'}</td>
                    <td>
                      <span className={'badge ' + (ACTION_BADGE[l.action] || 'badge-muted')}>
                        {l.action || '—'}
                      </span>
                    </td>
                    <td>
                      <span className="pill">{l.entity || '—'}</span>
                    </td>
                    <td>{l.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
