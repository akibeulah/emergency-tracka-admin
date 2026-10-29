// Alerts dashboard (14-3, 14-5). Reads /admin/alerts. Where the server has not
// produced any alert of a watched type yet, the section shows a clearly marked
// example of what one will look like — never presented as a real alert.

import { useState } from 'react';
import { api } from '../api';
import type { Alert, AlertSeverity, AlertStatus, AlertType } from '../api/types';
import { isMocked } from '../config';
import { Icon, type IconName } from '../components/Icon';
import { Banner, Crumbs, ExampleTag, Loading, PageHead, Pill, fmtDateTime, useToast } from '../components/ui';
import { useAction, useResource } from '../components/useResource';

interface TypeMeta {
  label: string;
  icon: IconName;
  explain: string;
  fields: Record<string, string>;
}

const TYPE_META: Record<AlertType, TypeMeta> = {
  capability_mismatch: {
    label: 'Capability mismatch',
    icon: 'alert',
    explain: 'What a facility declared did not match what the escort or receiving team found.',
    fields: { caseNumber: 'Case', declared: 'Declared', found: 'Found' },
  },
  accept_then_cancel: {
    label: 'Accept-then-cancel',
    icon: 'refresh',
    explain: 'A facility accepts referrals and then cancels them, which costs the patient time.',
    fields: { cancellations7d: 'Cancelled (7 days)', accepted7d: 'Accepted (7 days)', lastCaseNumber: 'Latest case', action: 'Action taken' },
  },
  payout_change: {
    label: 'Payout account change',
    icon: 'key',
    explain: 'A facility changed its payout bank account. Payouts hold for 48 hours until a call-back confirms it.',
    fields: { bank: 'Bank', last4: 'Account ending', holdUntil: 'Held until', callBack: 'Call-back' },
  },
  price_anomaly: {
    label: 'Price anomaly',
    icon: 'trendUp',
    explain: 'A care-package price is more than twice the median of similar facilities.',
    fields: { packageName: 'Package', price: 'Price', median: 'Median' },
  },
  repeated_failed_signin: {
    label: 'Repeated failed sign-ins',
    icon: 'shield',
    explain: 'Many wrong codes for one account or address.',
    fields: { attempts: 'Attempts', window: 'Window' },
  },
  paid_after_cancellation: {
    label: 'Paid after cancellation',
    icon: 'alert',
    explain: 'A payment arrived for a case that was already cancelled.',
    fields: {},
  },
  payment_mismatch: {
    label: 'Payment mismatch',
    icon: 'alert',
    explain: 'The amount or currency paid did not match the case.',
    fields: {},
  },
};

/** The three the pilot watches first; the rest list under "Other". */
const WATCHED: AlertType[] = ['capability_mismatch', 'accept_then_cancel', 'payout_change'];

/** Shown only when the server has produced no alert of that type. */
const SAMPLES: Record<string, Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>> = {
  capability_mismatch: {
    type: 'capability_mismatch',
    facilityCode: '0000',
    facilityName: 'Example facility',
    severity: 'critical',
    context: { caseNumber: 'TR-EXAMPLE', declared: 'ICU bed, ventilator available', found: 'No ventilator on arrival' },
    status: 'open',
  },
  accept_then_cancel: {
    type: 'accept_then_cancel',
    facilityCode: '0000',
    facilityName: 'Example facility',
    severity: 'warning',
    context: { cancellations7d: 3, accepted7d: 5 },
    status: 'open',
  },
  payout_change: {
    type: 'payout_change',
    facilityCode: '0000',
    facilityName: 'Example facility',
    severity: 'warning',
    context: { bank: 'Example Bank', last4: '0000', callBack: 'Not yet done' },
    status: 'open',
  },
};

const SEVERITY: Record<AlertSeverity, { tone: 'danger' | 'warning' | 'muted'; label: string; icon: IconName }> = {
  critical: { tone: 'danger', label: 'Critical', icon: 'alert' },
  warning: { tone: 'warning', label: 'Warning', icon: 'alert' },
  info: { tone: 'muted', label: 'Info', icon: 'bell' },
};

const STATUS: Record<AlertStatus, { tone: 'warning' | 'neutral' | 'success'; label: string; icon: IconName }> = {
  open: { tone: 'warning', label: 'Open', icon: 'bell' },
  reviewing: { tone: 'neutral', label: 'Reviewing', icon: 'search' },
  resolved: { tone: 'success', label: 'Resolved', icon: 'checkCircle' },
};

function contextValue(key: string, v: unknown): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v);
  if (key === 'last4') return `•••• ${String(v)}`;
  return String(v);
}

function AlertCard({ alert, sample, onStatus, busy }: { alert: Alert; sample?: boolean; onStatus?: (s: AlertStatus) => void; busy?: boolean }) {
  const meta = TYPE_META[alert.type];
  const sev = SEVERITY[alert.severity];
  const st = STATUS[alert.status];
  const known = Object.keys(meta.fields)
    .filter((k) => alert.context[k] !== undefined)
    .map((k) => [k, alert.context[k]] as const);
  const extra = Object.entries(alert.context).filter(([k]) => !(k in meta.fields));

  return (
    <div className={`alert-card${sample ? ' sample' : ''}`}>
      <div className={`alert-card__icon ${alert.severity}`}>
        <Icon name={meta.icon} size={17} />
      </div>
      <div className="alert-card__main">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div className="bold">
            {alert.facilityName ?? 'Network-wide'}
            {alert.facilityCode && !sample && <span className="mono faint small"> · {alert.facilityCode}</span>}
          </div>
          <div className="row">
            {sample && <ExampleTag>Example, not a real alert</ExampleTag>}
            <Pill tone={sev.tone} icon={sev.icon}>
              {sev.label}
            </Pill>
            {!sample && (
              <Pill tone={st.tone} icon={st.icon}>
                {st.label}
              </Pill>
            )}
          </div>
        </div>
        <div className="mt-4">
          {[...known, ...extra].map(([k, v]) => (
            <div className="small" key={k}>
              <span className="faint">{meta.fields[k] ?? k}:</span> {contextValue(k, v)}
            </div>
          ))}
        </div>
        {!sample && (
          <div className="row mt-8" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span className="tiny faint">Raised {fmtDateTime(alert.createdAt)}</span>
            {onStatus && (
              <div className="row">
                {alert.status === 'open' && (
                  <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => onStatus('reviewing')}>
                    <Icon name="search" size={14} /> Start review
                  </button>
                )}
                {alert.status !== 'resolved' && (
                  <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => onStatus('resolved')}>
                    <Icon name="check" size={14} /> Mark resolved
                  </button>
                )}
                {alert.status === 'resolved' && (
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onStatus('open')}>
                    Reopen
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type Filter = AlertStatus | 'active' | 'all';

export function AlertsPage() {
  const [filter, setFilter] = useState<Filter>('active');
  // Load every alert once; filter here so a type with no alerts at all is known.
  const alerts = useResource(() => api.alerts.list(), []);
  const action = useAction();
  const toast = useToast();

  async function setStatus(a: Alert, status: AlertStatus) {
    const res = await action.run(() => api.alerts.setStatus(a.id, status));
    if (!res) return;
    alerts.setData((list) => (list ?? []).map((x) => (x.id === res.id ? res : x)));
    toast(`Alert marked ${STATUS[status].label.toLowerCase()}`);
  }

  const all = alerts.data ?? [];
  const visible = all.filter((a) =>
    filter === 'all' ? true : filter === 'active' ? a.status !== 'resolved' : a.status === filter,
  );
  const other = visible.filter((a) => !WATCHED.includes(a.type));
  const counts = (t: AlertType) => all.filter((a) => a.type === t && a.status !== 'resolved').length;

  return (
    <>
      <Crumbs items={[{ label: 'Platform Admin' }, { label: 'Alerts' }]} />
      <PageHead
        title="Alerts"
        sub="Patterns that need a person to look at them: capability that did not match, facilities that accept and then cancel, and payout-account changes."
        actions={isMocked('alerts') ? <ExampleTag>Example data (mock)</ExampleTag> : undefined}
      />
      {!api.capabilities.alertStatus && (
        <Banner tone="info" title="Alert status is read-only for now.">
          The server lists alerts but cannot yet mark one as reviewing or resolved, so those buttons are hidden.
        </Banner>
      )}

      <div className="web-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        {WATCHED.map((t) => (
          <div className="stat-card" key={t}>
            <div className="stat-card__label row">
              <Icon name={TYPE_META[t].icon} size={15} /> {TYPE_META[t].label}
            </div>
            <div className="stat-card__value">{alerts.data ? counts(t) : '—'}</div>
            <div className="tiny faint">open or in review</div>
          </div>
        ))}
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ['active', 'Needs attention'],
            ['open', 'Open'],
            ['reviewing', 'Reviewing'],
            ['resolved', 'Resolved'],
            ['all', 'All'],
          ] as [Filter, string][]
        ).map(([v, label]) => (
          <button key={v} role="tab" aria-selected={filter === v} className={`tab${filter === v ? ' active' : ''}`} onClick={() => setFilter(v)}>
            {label}
          </button>
        ))}
      </div>

      {action.error && <Banner tone="danger">{action.error}</Banner>}

      {alerts.loading && !alerts.data ? (
        <Loading />
      ) : alerts.error ? (
        <Banner tone="danger" title="Could not load alerts.">
          {alerts.error}
        </Banner>
      ) : (
        <>
          {WATCHED.map((t) => {
            const meta = TYPE_META[t];
            const ofType = visible.filter((a) => a.type === t);
            const neverRaised = !all.some((a) => a.type === t);
            return (
              <section className="web-panel" key={t}>
                <div className="web-panel__head">
                  <div>
                    <h2>{meta.label}</h2>
                    <div className="web-panel__sub" style={{ marginBottom: 0 }}>
                      {meta.explain}
                    </div>
                  </div>
                </div>
                {neverRaised ? (
                  <>
                    <p className="small faint">
                      Nothing has raised this alert yet. When the server starts producing it, alerts will appear here like
                      this:
                    </p>
                    <AlertCard sample alert={{ ...SAMPLES[t], id: `sample-${t}`, createdAt: '', updatedAt: '' }} />
                  </>
                ) : ofType.length === 0 ? (
                  <p className="small faint">No alerts of this type in this view.</p>
                ) : (
                  ofType.map((a) => (
                    <AlertCard key={a.id} alert={a} busy={action.busy} onStatus={api.capabilities.alertStatus ? (s) => void setStatus(a, s) : undefined} />
                  ))
                )}
              </section>
            );
          })}
          {other.length > 0 && (
            <section className="web-panel">
              <h2>Other alerts</h2>
              {other.map((a) => (
                <AlertCard key={a.id} alert={a} busy={action.busy} onStatus={api.capabilities.alertStatus ? (s) => void setStatus(a, s) : undefined} />
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
