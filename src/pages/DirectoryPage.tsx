// Facility directory (14-2) with suspend / reinstate (1-12). Suspending blocks new
// transfers, lets in-flight cases finish, and signs out every session for the code.

import { useState } from 'react';
import { api } from '../api';
import { FACILITY_TYPE_LABEL, type FacilityRow, type FacilityStatus, type FacilityType } from '../api/types';
import { isMocked } from '../config';
import { Icon } from '../components/Icon';
import { Banner, Crumbs, Empty, ExampleTag, Loading, Modal, PageHead, Pill, fmtDate, useToast } from '../components/ui';
import { useAction, useDebounced, useResource } from '../components/useResource';

const MIN_REASON = 10;

function StatusPill({ row }: { row: FacilityRow }) {
  if (row.status === 'suspended') return <Pill tone="danger" icon="shield">Suspended</Pill>;
  return <Pill tone="success" icon="verified">Verified</Pill>;
}

export function DirectoryPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<FacilityStatus | ''>('');
  const [type, setType] = useState<FacilityType | ''>('');
  const [suspending, setSuspending] = useState<FacilityRow | null>(null);
  const [reinstating, setReinstating] = useState<FacilityRow | null>(null);
  const query = useDebounced(q);
  const list = useResource(() => api.facilities.list({ q: query, status, type }), [query, status, type]);

  return (
    <>
      <Crumbs items={[{ label: 'Platform Admin' }, { label: 'Facility Directory' }]} />
      <PageHead
        title="Facility Directory"
        sub="Every verified facility and its code. Suspending a facility blocks new transfers to and from it, lets cases already in progress finish, and signs out all of its staff."
        actions={isMocked('facilities') ? <ExampleTag>Example data (mock)</ExampleTag> : undefined}
      />
      {!api.capabilities.suspendedInDirectory && (
        <Banner tone="info" title="Suspended facilities are not listed yet.">
          The server's directory returns verified facilities only, so a facility drops out of this list once it is
          suspended and cannot be reinstated from here yet. Staff counts and verification dates are not returned either.
        </Banner>
      )}
      <div className="web-panel">
        <div className="toolbar">
          <div className="toolbar__search">
            <Icon name="search" />
            <input
              type="text"
              placeholder="Search by name, LGA or code…"
              aria-label="Search facilities"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as FacilityStatus | '')}>
            <option value="">All statuses</option>
            <option value="verified">Verified</option>
            <option value="suspended">Suspended</option>
          </select>
          <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value as FacilityType | '')}>
            <option value="">All types</option>
            {Object.entries(FACILITY_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {list.data && <span className="toolbar__count">{list.data.length} facilities</span>}
        </div>

        {list.loading && !list.data ? (
          <Loading />
        ) : list.error ? (
          <Banner tone="danger" title="Could not load facilities.">
            {list.error}
          </Banner>
        ) : !list.data?.length ? (
          <Empty>No facilities match these filters.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="web-table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>LGA</th>
                  <th>Staff</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="bold">{f.name}</div>
                      {f.verifiedAt && <div className="tiny faint">Verified {fmtDate(f.verifiedAt)}</div>}
                    </td>
                    <td>
                      <span className="mono bold">{f.facilityCode}</span>
                      <div className="tiny faint mono">{f.displayCode}</div>
                    </td>
                    <td>{FACILITY_TYPE_LABEL[f.type]}</td>
                    <td>{f.lga}</td>
                    <td>{f.staffCount ?? <span className="faint">—</span>}</td>
                    <td>
                      <StatusPill row={f} />
                      {f.suspension && (
                        <div className="tiny faint mt-4" title={f.suspension.reason}>
                          {fmtDate(f.suspension.at)} by {f.suspension.by}
                        </div>
                      )}
                    </td>
                    <td>
                      {f.status === 'suspended' ? (
                        <button className="btn btn-outline btn-sm" onClick={() => setReinstating(f)}>
                          Reinstate
                        </button>
                      ) : (
                        <button className="btn btn-danger btn-sm" onClick={() => setSuspending(f)}>
                          Suspend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {suspending && (
        <SuspendModal row={suspending} onClose={() => setSuspending(null)} onDone={() => void list.reload()} />
      )}
      {reinstating && (
        <ReinstateModal row={reinstating} onClose={() => setReinstating(null)} onDone={() => void list.reload()} />
      )}
    </>
  );
}

function SuspendModal({ row, onClose, onDone }: { row: FacilityRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const action = useAction();
  const toast = useToast();

  async function confirm() {
    const res = await action.run(() => api.facilities.suspend(row.id, reason.trim()));
    if (!res) return;
    toast(`${row.name} suspended`, 'shield');
    onDone();
    onClose();
  }

  return (
    <Modal
      title="Suspend facility"
      sub={`${row.name} · ${row.displayCode}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline btn-sm" onClick={onClose} disabled={action.busy}>
            Cancel
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => void confirm()}
            disabled={action.busy || reason.trim().length < MIN_REASON}
          >
            <Icon name="shield" size={14} /> {action.busy ? 'Suspending…' : 'Suspend facility'}
          </button>
        </>
      }
    >
      <Banner tone="warning" title="What happens">
        No new referrals can be sent to or from this facility. Cases already in progress finish. Every staff session for
        code {row.facilityCode} is signed out, and held funds stay held.
      </Banner>
      <div className="field">
        <label htmlFor="suspend-reason">Reason</label>
        <textarea
          id="suspend-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Capability claims did not match on three handovers this week…"
          autoFocus
        />
        <div className="hint">Required. Recorded in the audit log and shared with the facility.</div>
      </div>
      {action.error && <Banner tone="danger">{action.error}</Banner>}
    </Modal>
  );
}

function ReinstateModal({ row, onClose, onDone }: { row: FacilityRow; onClose: () => void; onDone: () => void }) {
  const action = useAction();
  const toast = useToast();

  async function confirm() {
    const res = await action.run(() => api.facilities.reinstate(row.id));
    if (!res) return;
    toast(`${row.name} reinstated`);
    onDone();
    onClose();
  }

  return (
    <Modal
      title="Reinstate facility"
      sub={`${row.name} · ${row.displayCode}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline btn-sm" onClick={onClose} disabled={action.busy}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => void confirm()} disabled={action.busy}>
            {action.busy ? 'Reinstating…' : 'Reinstate'}
          </button>
        </>
      }
    >
      {row.suspension && (
        <div className="kv">
          <span className="kv__label">Suspended for</span>
          <span className="kv__value">{row.suspension.reason}</span>
        </div>
      )}
      <p className="small mt-12">The facility can send and receive referrals again. Its staff sign in as normal.</p>
      {action.error && <Banner tone="danger">{action.error}</Banner>}
    </Modal>
  );
}
