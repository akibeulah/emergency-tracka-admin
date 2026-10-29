import type { ApiClient } from './client';
import { ApiError } from './errors';
import { createHttp } from './http';
import type { SessionStore } from './session';
import {
  PLATFORM_FACILITY,
  type Account,
  type Alert,
  type ClaimApproval,
  type ClaimDetail,
  type ClaimDocument,
  type ClaimSummary,
  type FacilityRow,
  type FacilityStatus,
  type FacilityType,
  type Ownership,
  type Permission,
  type Role,
  type Session,
} from './types';

// The HTTP adapter for server/. Every route here exists in server/src/modules/**
// (listed in server/README.md, "API"). The server returns its Mongo documents
// more or less as stored; the converters below turn them into the console's
// types. Where the server has no route for something the console can do in mock
// mode, `capabilities` says so and the page shows an honest "not available" state
// instead of made-up data.

// ─── Server shapes (as returned today) ────────────────────────────────────

interface ServerUser {
  id: string;
  email: string;
  name: string | null;
  facilityCode: string;
  role: Role;
  permissions: Permission[];
}

interface ServerTokens {
  accessToken: string;
  refreshToken: string;
}

interface ServerApproval {
  adminId: string;
  at: string;
}

interface ServerClaim {
  submittedBy: string;
  contactEmail: string;
  contactPhone?: string;
  legalName: string;
  licenceNumber: string;
  /** Storage keys; upload and signed links are not wired on the server yet. */
  documents: string[];
  submittedAt: string;
  approvals: ServerApproval[];
  decision?: 'approved' | 'rejected';
  reason?: string;
  decidedAt?: string;
}

interface ServerFacility {
  _id: string;
  name: string;
  address?: string;
  lga?: string;
  type: FacilityType;
  ownership?: Ownership;
  location?: { lat: number; lng: number };
  registrySource?: { name: string; recordId: string };
  /** Absent on GET /facilities, which only returns verified rows. */
  status?: FacilityStatus;
  facilityCode?: string;
  displayCode?: string;
  claim?: ServerClaim;
}

interface ServerApproveResult {
  facility: ServerFacility;
  issued: boolean;
  approvalsNeeded: number;
}

interface ServerAlert {
  _id: string;
  type: Alert['type'];
  facilityCode?: string;
  severity: Alert['severity'];
  context?: Record<string, unknown>;
  status: Alert['status'];
  createdAt: string;
  updatedAt: string;
}

// ─── Converters ──────────────────────────────────────────────────────────

function toSession(res: ServerTokens & { user: ServerUser }): Session {
  const account: Account = {
    facilityCode: res.user.facilityCode,
    displayCode: null,
    facilityName: null,
    role: res.user.role,
    permissions: res.user.permissions,
  };
  return {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    user: { id: res.user.id, email: res.user.email, name: res.user.name ?? res.user.email },
    account,
    // The server has no account switch: every (facilityCode, email) account needs
    // its own OTP, and this console only serves PLATFORM accounts. Other accounts
    // on the same email are used in the facility console, so they are not offered here.
    accounts: [account],
  };
}

export function createLiveApi(sessions: SessionStore): ApiClient {
  const http = createHttp(sessions);
  const enc = encodeURIComponent;

  /** The server does not resolve approver names; it stores admin ids only. */
  function approval(a: ServerApproval): ClaimApproval {
    const me = sessions.get()?.user;
    return {
      adminId: a.adminId,
      adminName: me && me.id === a.adminId ? `${me.name} (you)` : 'Another platform administrator',
      at: a.at,
    };
  }

  function document(key: string, submittedAt: string): ClaimDocument {
    const fileName = key.split('/').pop() || key;
    return { key, label: 'Document', fileName, url: null, uploadedAt: submittedAt };
  }

  function toDetail(f: ServerFacility): ClaimDetail {
    const c = f.claim;
    if (!c) throw new ApiError('not_found', 'This facility has no claim on record.');
    return {
      facilityId: f._id,
      facilityName: f.name,
      type: f.type,
      ownership: f.ownership ?? 'other',
      address: f.address ?? '—',
      lga: f.lga ?? '—',
      location: f.location ?? null,
      registrySource: f.registrySource ? { name: f.registrySource.name, recordId: f.registrySource.recordId } : null,
      status: f.status ?? 'claim_pending',
      facilityCode: f.facilityCode ?? null,
      displayCode: f.displayCode ?? null,
      claim: {
        legalName: c.legalName,
        licenceNumber: c.licenceNumber,
        // The server's claim form does not ask for the contact's name or role.
        contactName: null,
        contactRole: null,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone ?? null,
        documents: (c.documents ?? []).map((k) => document(k, c.submittedAt)),
        submittedAt: c.submittedAt,
        approvals: (c.approvals ?? []).map(approval),
        decision: c.decision ?? null,
        reason: c.reason ?? null,
        decidedAt: c.decidedAt ?? null,
        decidedBy: null,
      },
    };
  }

  function toSummary(f: ServerFacility): ClaimSummary {
    const d = toDetail(f);
    return {
      facilityId: d.facilityId,
      facilityName: d.facilityName,
      type: d.type,
      lga: d.lga,
      status: d.status,
      submittedAt: d.claim.submittedAt,
      contactName: d.claim.contactName,
      contactEmail: d.claim.contactEmail,
      approvals: d.claim.approvals,
      decision: d.claim.decision,
    };
  }

  function toRow(f: ServerFacility): FacilityRow {
    return {
      id: f._id,
      name: f.name,
      type: f.type,
      lga: f.lga ?? '—',
      // GET /facilities lists verified facilities only and leaves the status out.
      status: f.status ?? 'verified',
      facilityCode: f.facilityCode ?? null,
      displayCode: f.displayCode ?? null,
      verifiedAt: null, // not returned by the server
      staffCount: null, // not returned by the server
      suspension: null, // the suspension reason lives in the audit log only
    };
  }

  async function pendingClaims(): Promise<ServerFacility[]> {
    return http.get<ServerFacility[]>('/admin/facilities/claims');
  }

  /** GET /facilities, for resolving alert facility codes to names. Best effort. */
  async function facilityNames(): Promise<Map<string, string>> {
    try {
      const rows = await http.get<ServerFacility[]>('/facilities');
      return new Map(rows.filter((r) => r.facilityCode).map((r) => [r.facilityCode!, r.name]));
    } catch {
      return new Map();
    }
  }

  return {
    capabilities: {
      decidedClaims: false,
      suspendedInDirectory: false,
      alertStatus: false,
    },

    auth: {
      async requestOtp(input) {
        // Returns { message, devCode? }; devCode is only echoed by a dev server and is not used here.
        await http.post('/auth/otp/request', input);
      },
      async verifyOtp(input) {
        return toSession(await http.post<ServerTokens & { user: ServerUser }>('/auth/otp/verify', input));
      },
      switchAccount: () =>
        Promise.reject(
          new ApiError(
            'not_found',
            'Each account needs its own sign-in code. Sign out, then sign in to the other account with its facility code.',
          ),
        ),
      async logout() {
        await http.post('/auth/logout');
      },
    },

    claims: {
      async list(view) {
        if (view === 'decided') {
          throw new ApiError('not_found', 'The server does not list decided claims yet.');
        }
        return (await pendingClaims()).filter((f) => f.claim).map(toSummary);
      },
      async get(id) {
        // No single-claim route: GET /admin/facilities/claims returns every pending claim in full.
        const f = (await pendingClaims()).find((x) => x._id === id);
        if (!f) throw new ApiError('not_found', 'This claim is no longer pending. It may have been decided by another administrator.');
        return toDetail(f);
      },
      async approve(id) {
        const res = await http.post<ServerApproveResult>(`/admin/facilities/${enc(id)}/approve`);
        const claim = toDetail(res.facility);
        const issued =
          res.issued && claim.facilityCode && claim.displayCode
            ? { facilityCode: claim.facilityCode, displayCode: claim.displayCode }
            : null;
        return { claim, issued };
      },
      async reject(id, reason) {
        // On reject the server returns the row to 'unclaimed' with claim.decision = 'rejected'.
        return toDetail(await http.post<ServerFacility>(`/admin/facilities/${enc(id)}/reject`, { reason }));
      },
    },

    facilities: {
      async list(filter) {
        // GET /facilities: verified only, no server-side search. Filter here.
        const q = filter.q?.trim().toLowerCase();
        return (await http.get<ServerFacility[]>('/facilities'))
          .map(toRow)
          .filter((f) => !filter.status || f.status === filter.status)
          .filter((f) => !filter.type || f.type === filter.type)
          .filter(
            (f) =>
              !q ||
              f.name.toLowerCase().includes(q) ||
              f.lga.toLowerCase().includes(q) ||
              (f.facilityCode ?? '').includes(q) ||
              (f.displayCode ?? '').toLowerCase().includes(q),
          );
      },
      async suspend(id, reason) {
        const res = await http.post<{ facility: ServerFacility; sessionsRevoked: number }>(
          `/admin/facilities/${enc(id)}/suspend`,
          { reason },
        );
        return toRow({ ...res.facility, status: res.facility.status ?? 'suspended' });
      },
      async reinstate(id) {
        return toRow(await http.post<ServerFacility>(`/admin/facilities/${enc(id)}/reinstate`));
      },
    },

    alerts: {
      async list(status) {
        const [rows, names] = await Promise.all([
          http.get<ServerAlert[]>(`/admin/alerts${status ? `?status=${enc(status)}` : ''}`),
          facilityNames(),
        ]);
        return rows.map(
          (a): Alert => ({
            id: a._id,
            type: a.type,
            facilityCode: a.facilityCode ?? null,
            facilityName: a.facilityCode
              ? (names.get(a.facilityCode) ?? (a.facilityCode === PLATFORM_FACILITY ? null : `Facility ${a.facilityCode}`))
              : null,
            severity: a.severity,
            context: a.context ?? {},
            status: a.status,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          }),
        );
      },
      setStatus: () => Promise.reject(new ApiError('not_found', 'The server cannot change an alert’s status yet.')),
    },
  };
}
