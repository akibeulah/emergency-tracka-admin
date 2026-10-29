import { ALL_CAPABILITIES, type ApiClient } from '../client';
import { ApiError } from '../errors';
import type { SessionStore } from '../session';
import {
  PLATFORM_FACILITY,
  type Account,
  type ClaimDetail,
  type ClaimSummary,
  type FacilityRow,
  type FacilityType,
  type Ownership,
  type Session,
} from '../types';
import { checkOtpShape, createDb, nowIso, requireFound } from './db';
import { checkDigit, seed, type MockDb, type MockFacility } from './seed';

const PLATFORM_ACCOUNT: Account = {
  facilityCode: PLATFORM_FACILITY,
  displayCode: null,
  facilityName: null,
  role: 'platform_admin',
  permissions: ['platform.admin'],
};

/** G4 is open: the type segment and check digit here are placeholders until the server fixes them. */
function typeSegment(type: FacilityType, ownership: Ownership): string {
  if (type === 'blood_bank') return 'BBK';
  if (type === 'ambulance_operator') return 'AMB';
  if (type === 'clinic' || ownership === 'private') return 'PEC';
  return 'HOS';
}

function toSummary(f: MockFacility): ClaimSummary {
  const c = f.claim!;
  return {
    facilityId: f.id,
    facilityName: f.name,
    type: f.type,
    lga: f.lga,
    status: f.status,
    submittedAt: c.submittedAt,
    contactName: c.contactName,
    contactEmail: c.contactEmail,
    approvals: c.approvals,
    decision: c.decision,
  };
}

function toDetail(f: MockFacility): ClaimDetail {
  return {
    facilityId: f.id,
    facilityName: f.name,
    type: f.type,
    ownership: f.ownership,
    address: f.address,
    lga: f.lga,
    location: f.location,
    registrySource: f.registrySource,
    status: f.status,
    facilityCode: f.facilityCode,
    displayCode: f.displayCode,
    claim: f.claim!,
  };
}

function toRow(f: MockFacility): FacilityRow {
  return {
    id: f.id,
    name: f.name,
    type: f.type,
    lga: f.lga,
    status: f.status,
    facilityCode: f.facilityCode,
    displayCode: f.displayCode,
    verifiedAt: f.verifiedAt,
    staffCount: f.staffCount,
    suspension: f.suspension,
  };
}

export function createMockApi(sessions: SessionStore): ApiClient {
  const db = createDb<MockDb>('et.admin.mockdb.v1', seed);

  function me() {
    const s = sessions.get();
    if (!s) throw new ApiError('unauthorised', 'Sign in again.');
    if (!s.account.permissions.includes('platform.admin')) throw new ApiError('forbidden', 'Platform administrators only.');
    return s.user;
  }

  function pendingClaim(d: MockDb, id: string): MockFacility {
    const f = requireFound(
      d.facilities.find((x) => x.id === id && x.claim),
      'Claim',
    );
    if (f.status !== 'claim_pending' || f.claim!.decision) {
      throw new ApiError('conflict', 'This claim has already been decided.');
    }
    return f;
  }

  function byId(d: MockDb, id: string) {
    return requireFound(
      d.facilities.find((f) => f.id === id),
      'Facility',
    );
  }

  return {
    capabilities: ALL_CAPABILITIES,
    auth: {
      requestOtp: () => db.call(() => undefined),
      verifyOtp: ({ email, code }) =>
        db.call((d): Session => {
          checkOtpShape(code);
          const admin = d.admins.find((a) => a.email === email.trim().toLowerCase());
          // A real server answers "invalid or expired code" for an unknown email too.
          if (!admin) throw new ApiError('unauthorised', 'That code is not valid or has expired. Request a new one.');
          return {
            accessToken: `mock.${admin.id}`,
            refreshToken: `mock-refresh.${admin.id}`,
            user: { id: admin.id, name: admin.name, email: admin.email },
            account: PLATFORM_ACCOUNT,
            accounts: [PLATFORM_ACCOUNT],
          };
        }),
      switchAccount: () => Promise.reject(new ApiError('not_found', 'No other accounts on this console.')),
      logout: () => db.call(() => undefined),
    },

    claims: {
      list: (view) =>
        db.call((d) => {
          me();
          return d.facilities
            .filter((f) => f.claim && (view === 'pending' ? !f.claim.decision : !!f.claim.decision))
            .map(toSummary)
            .sort((a, b) => (view === 'pending' ? a.submittedAt.localeCompare(b.submittedAt) : b.submittedAt.localeCompare(a.submittedAt)));
        }),
      get: (id) =>
        db.call((d) => {
          me();
          return toDetail(requireFound(d.facilities.find((f) => f.id === id && f.claim), 'Claim'));
        }),
      approve: (id) =>
        db.call((d) => {
          const admin = me();
          const f = pendingClaim(d, id);
          const claim = f.claim!;
          if (claim.approvals.some((a) => a.adminId === admin.id)) {
            throw new ApiError('conflict', 'You have already approved this claim. A second, different administrator must approve it.');
          }
          claim.approvals.push({ adminId: admin.id, adminName: admin.name, at: nowIso() });
          let issued = null;
          if (claim.approvals.length >= 2) {
            d.counter += 1;
            const seq = String(d.counter).padStart(4, '0');
            f.facilityCode = seq;
            f.displayCode = `ET-${typeSegment(f.type, f.ownership)}-LAG-${seq}-${checkDigit(seq)}`;
            f.status = 'verified';
            f.verifiedAt = nowIso();
            f.staffCount = 1; // the claimant becomes the first facility_admin
            claim.decision = 'approved';
            claim.decidedAt = nowIso();
            claim.decidedBy = admin.name;
            issued = { facilityCode: f.facilityCode, displayCode: f.displayCode };
          }
          return { claim: toDetail(f), issued };
        }),
      reject: (id, reason) =>
        db.call((d) => {
          const admin = me();
          if (reason.trim().length < 10) throw new ApiError('validation', 'Give a reason of at least 10 characters.');
          const f = pendingClaim(d, id);
          Object.assign(f.claim!, { decision: 'rejected', reason: reason.trim(), decidedAt: nowIso(), decidedBy: admin.name });
          // The record goes back to the registry so a corrected claim can be made.
          f.status = 'unclaimed';
          return toDetail(f);
        }),
    },

    facilities: {
      list: (filter) =>
        db.call((d) => {
          me();
          const q = filter.q?.trim().toLowerCase();
          return d.facilities
            .filter((f) => f.status === 'verified' || f.status === 'suspended')
            .filter((f) => !filter.status || f.status === filter.status)
            .filter((f) => !filter.type || f.type === filter.type)
            .filter(
              (f) =>
                !q ||
                f.name.toLowerCase().includes(q) ||
                f.lga.toLowerCase().includes(q) ||
                (f.facilityCode ?? '').includes(q) ||
                (f.displayCode ?? '').toLowerCase().includes(q),
            )
            .map(toRow)
            .sort((a, b) => a.name.localeCompare(b.name));
        }),
      suspend: (id, reason) =>
        db.call((d) => {
          const admin = me();
          if (reason.trim().length < 10) throw new ApiError('validation', 'Give a reason of at least 10 characters.');
          const f = byId(d, id);
          if (f.status === 'suspended') throw new ApiError('conflict', 'This facility is already suspended.');
          f.status = 'suspended';
          f.suspension = { reason: reason.trim(), at: nowIso(), by: admin.name };
          return toRow(f);
        }),
      reinstate: (id) =>
        db.call((d) => {
          me();
          const f = byId(d, id);
          if (f.status !== 'suspended') throw new ApiError('conflict', 'This facility is not suspended.');
          f.status = 'verified';
          f.suspension = null;
          return toRow(f);
        }),
    },

    alerts: {
      list: (status) =>
        db.call((d) => {
          me();
          return d.alerts
            .filter((a) => !status || a.status === status)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }),
      setStatus: (id, status) =>
        db.call((d) => {
          me();
          const a = requireFound(
            d.alerts.find((x) => x.id === id),
            'Alert',
          );
          a.status = status;
          a.updatedAt = nowIso();
          return a;
        }),
    },

    demo: {
      personas: () =>
        db.data.admins.map((a) => ({
          name: a.name,
          email: a.email,
          note: 'Platform admin',
        })),
      reset: () => db.reset(),
    },
  };
}
