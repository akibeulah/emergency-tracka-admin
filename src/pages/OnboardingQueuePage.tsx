// Onboarding queue (14-1): review a claim and its documents, then either
// approve under the two-person rule (1-4) — the second distinct approval issues
// the facility code (1-5) — or reject with a required reason.

import { useState } from 'react';
import { api } from '../api';
import { FACILITY_TYPE_LABEL, type ClaimApproval, type ClaimDetail, type ClaimSummary, type ClaimView } from '../api/types';
import { isMocked } from '../config';
import { Icon } from '../components/Icon';
import { useSession } from '../components/auth';
import { Banner, Crumbs, Empty, ExampleTag, Loading, Modal, PageHead, Pill, fmtDate, fmtDateTime, useToast } from '../components/ui';
import { useAction, useResource } from '../components/useResource';

const REQUIRED_APPROVALS = 2;
const MIN_REASON = 10;

function ApprovalPill({ approvals }: { approvals: ClaimApproval[] }) {
  const n = approvals.length;
  if (n === 0) return <Pill tone="muted" icon="clock">0 of {REQUIRED_APPROVALS} approvals</Pill>;
  return (
    <Pill tone="warning" icon="checkCircle">
      {n} of {REQUIRED_APPROVALS} approvals
    </Pill>
  );
}

function DecisionPill({ decision }: { decision: ClaimSummary['decision'] }) {
  if (decision === 'approved') return <Pill tone="success">Approved</Pill>;
  if (decision === 'rejected') return <Pill tone="danger">Rejected</Pill>;
  return <Pill tone="warning">Claim pending</Pill>;
}

export function OnboardingQueuePage() {
  const [view, setView] = useState<ClaimView>('pending');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const unavailable = view === 'decided' && !api.capabilities.decidedClaims;
  const claims = useResource(() => (unavailable ? Promise.resolve([]) : api.claims.list(view)), [view]);

  const rows = (claims.data ?? []).filter(
    (c) => !search.trim() || c.facilityName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <>
      <Crumbs items={[{ label: 'Platform Admin' }, { label: 'Onboarding Queue' }]} />
      <PageHead
        title="Onboarding Queue"
        sub="Review facility claims and their documents. Two different administrators must approve a claim before a Facility Code is issued; the code is the next number in sequence."
        actions={isMocked('claims') ? <ExampleTag>Example data (mock)</ExampleTag> : undefined}
      />

      <div className="tabs" role="tablist">
        {(['pending', 'decided'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={`tab${view === v ? ' active' : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'pending' ? 'Awaiting decision' : 'Decided'}
          </button>
        ))}
      </div>

      <div className="web-panel">
        <div className="toolbar">
          <div className="toolbar__search">
            <Icon name="search" />
            <input
              type="text"
              placeholder="Search by facility name…"
              aria-label="Search claims"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {claims.data && !unavailable && (
            <span className="toolbar__count">
              {rows.length} of {claims.data.length} {view === 'pending' ? 'in queue' : 'decided'}
            </span>
          )}
        </div>

        {unavailable ? (
          <Banner tone="info" title="Not available on the server yet.">
            The server lists claims awaiting a decision only. Approved and rejected claims are recorded in the audit
            log, but there is no route to list them here yet.
          </Banner>
        ) : claims.loading && !claims.data ? (
          <Loading />
        ) : claims.error ? (
          <Banner tone="danger" title="Could not load the queue.">
            {claims.error}{' '}
            <button className="btn btn-ghost btn-sm" onClick={() => void claims.reload()}>
              Try again
            </button>
          </Banner>
        ) : rows.length === 0 ? (
          <Empty>{view === 'pending' ? 'No claims are waiting for review.' : 'No decided claims yet.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="web-table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Type</th>
                  <th>LGA</th>
                  <th>Submitted</th>
                  <th>{view === 'pending' ? 'Approvals' : 'Decision'}</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.facilityId}>
                    <td>
                      <div className="bold">{c.facilityName}</div>
                      <div className="tiny faint">Claimed by {c.contactName ?? c.contactEmail}</div>
                    </td>
                    <td>{FACILITY_TYPE_LABEL[c.type]}</td>
                    <td>{c.lga}</td>
                    <td>{fmtDate(c.submittedAt)}</td>
                    <td>{view === 'pending' ? <ApprovalPill approvals={c.approvals} /> : <DecisionPill decision={c.decision} />}</td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => setOpenId(c.facilityId)}>
                        {view === 'pending' ? 'Review' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openId && (
        <ClaimReview
          facilityId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void claims.reload()}
        />
      )}
    </>
  );
}

type Stage = 'view' | 'approve' | 'reject' | 'approved-partial' | 'issued' | 'rejected';

function ClaimReview({ facilityId, onClose, onChanged }: { facilityId: string; onClose: () => void; onChanged: () => void }) {
  const session = useSession();
  const toast = useToast();
  const detail = useResource(() => api.claims.get(facilityId), [facilityId]);
  const action = useAction();
  const [stage, setStage] = useState<Stage>('view');
  const [reason, setReason] = useState('');
  const [issued, setIssued] = useState<{ facilityCode: string; displayCode: string } | null>(null);

  const d = detail.data;
  const pending = d && d.status === 'claim_pending' && !d.claim.decision;
  const iApproved = !!d?.claim.approvals.some((a) => a.adminId === session.user.id);
  const isSecond = (d?.claim.approvals.length ?? 0) === REQUIRED_APPROVALS - 1;

  async function approve() {
    const res = await action.run(() => api.claims.approve(facilityId));
    if (!res) return;
    detail.setData(res.claim);
    onChanged();
    if (res.issued) {
      setIssued(res.issued);
      setStage('issued');
      toast(`Facility Code ${res.issued.displayCode} issued`);
    } else {
      setStage('approved-partial');
      toast('Approval recorded. A second administrator must approve.');
    }
  }

  async function reject() {
    const res = await action.run(() => api.claims.reject(facilityId, reason.trim()));
    if (!res) return;
    detail.setData(res);
    setStage('rejected');
    onChanged();
    toast('Claim rejected', 'xCircle');
  }

  const footer = (() => {
    if (!d) return null;
    if (stage === 'approve')
      return (
        <>
          <button className="btn btn-outline btn-sm" onClick={() => setStage('view')} disabled={action.busy}>
            Cancel
          </button>
          <button className="btn btn-success btn-sm" onClick={() => void approve()} disabled={action.busy}>
            <Icon name="check" size={14} /> {action.busy ? 'Recording…' : isSecond ? 'Approve and issue code' : 'Record my approval'}
          </button>
        </>
      );
    if (stage === 'reject')
      return (
        <>
          <button className="btn btn-outline btn-sm" onClick={() => setStage('view')} disabled={action.busy}>
            Cancel
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => void reject()}
            disabled={action.busy || reason.trim().length < MIN_REASON}
          >
            <Icon name="x" size={14} /> {action.busy ? 'Rejecting…' : 'Confirm rejection'}
          </button>
        </>
      );
    if (stage === 'view' && pending)
      return (
        <>
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setStage('reject')}>
            Reject claim
          </button>
          <button
            className="btn btn-success btn-sm"
            onClick={() => setStage('approve')}
            disabled={iApproved}
            title={iApproved ? 'You have already approved. A different administrator must give the second approval.' : undefined}
          >
            Approve claim
          </button>
        </>
      );
    return (
      <button className="btn btn-outline btn-sm" onClick={onClose}>
        Close
      </button>
    );
  })();

  return (
    <Modal
      large
      title={d?.facilityName ?? 'Claim'}
      sub={d ? `${FACILITY_TYPE_LABEL[d.type]} · ${d.lga} LGA, Lagos` : undefined}
      onClose={onClose}
      footer={footer}
    >
      {detail.loading && !d ? (
        <Loading />
      ) : detail.error ? (
        <Banner tone="danger" title="Could not load this claim.">
          {detail.error}
        </Banner>
      ) : d ? (
        <>
          <ActionArea
            stage={stage}
            detail={d}
            iApproved={iApproved}
            isSecond={isSecond}
            reason={reason}
            setReason={setReason}
            issued={issued}
          />
          {action.error && <Banner tone="danger">{action.error}</Banner>}
          <ClaimBody d={d} />
        </>
      ) : null}
    </Modal>
  );
}

function ActionArea({
  stage,
  detail: d,
  iApproved,
  isSecond,
  reason,
  setReason,
  issued,
}: {
  stage: Stage;
  detail: ClaimDetail;
  iApproved: boolean;
  isSecond: boolean;
  reason: string;
  setReason: (s: string) => void;
  issued: { facilityCode: string; displayCode: string } | null;
}) {
  if (stage === 'approve')
    return (
      <Banner tone="info" title={isSecond ? 'This is the second approval.' : 'This is the first approval.'}>
        {isSecond
          ? 'Confirming verifies the facility, issues the next Facility Code in sequence, and makes the claimant its first facility administrator.'
          : 'Your approval is recorded. A second, different platform administrator must also approve before a code is issued.'}
      </Banner>
    );
  if (stage === 'reject')
    return (
      <div className="field">
        <label htmlFor="reject-reason">Reason for rejection</label>
        <textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Licence number could not be verified against the registry record…"
          autoFocus
        />
        <div className="hint">
          Required. Recorded against the claim and sent to the claimant. At least {MIN_REASON} characters.
        </div>
      </div>
    );
  if (stage === 'issued' && issued)
    return (
      <Banner tone="success" title="Claim approved. Facility Code issued.">
        <span className="code-display">{issued.displayCode}</span>
        <div className="tiny mt-8">
          Login code <span className="mono bold">{issued.facilityCode}</span>. The full code shows on the Verified Facility badge.
        </div>
      </Banner>
    );
  if (stage === 'approved-partial')
    return (
      <Banner tone="info" title="Your approval is recorded.">
        A second, different administrator must approve before the Facility Code is issued.
      </Banner>
    );
  if (d.claim.decision === 'rejected')
    return (
      <Banner tone="danger" title={`Rejected${d.claim.decidedBy ? ` by ${d.claim.decidedBy}` : ''} · ${fmtDate(d.claim.decidedAt)}`}>
        “{d.claim.reason}”
      </Banner>
    );
  if (d.claim.decision === 'approved')
    return (
      <Banner tone="success" title={`Approved · ${fmtDate(d.claim.decidedAt)}`}>
        Facility Code <span className="mono bold">{d.displayCode}</span>
      </Banner>
    );
  if (iApproved)
    return (
      <Banner tone="info" title="You have approved this claim.">
        A second, different administrator must approve before the code is issued.
      </Banner>
    );
  return null;
}

function ClaimBody({ d }: { d: ClaimDetail }) {
  const c = d.claim;
  return (
    <>
      <div className="modal__section-title">Approvals</div>
      <div className="approvals">
        {Array.from({ length: REQUIRED_APPROVALS }, (_, i) => {
          const a = c.approvals[i];
          return a ? (
            <div className="approval-slot done" key={i}>
              <Icon name="checkCircle" size={16} />
              <span>
                <strong>{a.adminName}</strong> · {fmtDateTime(a.at)}
              </span>
            </div>
          ) : (
            <div className="approval-slot" key={i}>
              <Icon name="clock" size={16} />
              <span>Approval {i + 1}: waiting</span>
            </div>
          );
        })}
      </div>

      <div className="modal__section-title">Claimant</div>
      <div className="kv"><span className="kv__label">Name</span><span className="kv__value">{c.contactName ?? <span className="faint">Not captured on the claim</span>}</span></div>
      <div className="kv"><span className="kv__label">Role at facility</span><span className="kv__value">{c.contactRole ?? <span className="faint">Not captured on the claim</span>}</span></div>
      <div className="kv"><span className="kv__label">Email</span><span className="kv__value">{c.contactEmail}</span></div>
      <div className="kv"><span className="kv__label">Phone</span><span className="kv__value">{c.contactPhone ?? '—'}</span></div>
      <div className="kv"><span className="kv__label">Submitted</span><span className="kv__value">{fmtDateTime(c.submittedAt)}</span></div>

      <div className="modal__section-title">Registration</div>
      <div className="kv"><span className="kv__label">Legal name</span><span className="kv__value">{c.legalName}</span></div>
      <div className="kv"><span className="kv__label">Licence number</span><span className="kv__value mono">{c.licenceNumber}</span></div>
      <div className="kv">
        <span className="kv__label">Registry record</span>
        <span className="kv__value">{d.registrySource ? `${d.registrySource.name} · ${d.registrySource.recordId}` : '—'}</span>
      </div>

      <div className="modal__section-title">Documents</div>
      {c.documents.length === 0 ? (
        <div className="faint small">No documents attached.</div>
      ) : (
        c.documents.map((doc) => (
          <div className="kv" key={doc.key}>
            <span className="kv__label">
              {doc.label}
              <div className="tiny faint">
                {doc.fileName} · uploaded {fmtDate(doc.uploadedAt)}
              </div>
            </span>
            <span className="kv__value">
              {doc.url ? (
                <a className="btn btn-outline btn-sm" href={doc.url} target="_blank" rel="noreferrer noopener">
                  <Icon name="file" size={14} /> Open
                </a>
              ) : (
                <span className="tiny faint">Preview not available</span>
              )}
            </span>
          </div>
        ))
      )}

      <div className="modal__section-title">Facility</div>
      <div className="kv"><span className="kv__label">Address</span><span className="kv__value">{d.address}</span></div>
      <div className="kv"><span className="kv__label">LGA</span><span className="kv__value">{d.lga}</span></div>
      <div className="kv">
        <span className="kv__label">Map pin</span>
        <span className="kv__value">{d.location ? `${d.location.lat.toFixed(4)}, ${d.location.lng.toFixed(4)}` : 'Not set'}</span>
      </div>

      <div className="hint mt-12">
        Before approving, confirm the licence against the registry and the claimant's identity. A facility's first
        onboarding is also verified by video call or visit (1-3).
      </div>
    </>
  );
}

