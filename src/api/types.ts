// The shapes the platform-admin console exchanges with server/. Field names follow
// docs/emergency-tracka-architecture.md §5 in camelCase, as the server schemas
// (server/src/modules/**/schemas) store them. Where §5 is silent the shape is a
// proposal; keep this file and the server DTOs in step.

export * from './identity';

export type FacilityType = 'hospital' | 'clinic' | 'blood_bank' | 'ambulance_operator';
export type FacilityStatus = 'unclaimed' | 'claim_pending' | 'verified' | 'suspended';
export type Ownership = 'general' | 'private' | 'mission' | 'other';

export const FACILITY_TYPE_LABEL: Record<FacilityType, string> = {
  hospital: 'Hospital',
  clinic: 'Clinic / Private EM centre',
  blood_bank: 'Blood bank',
  ambulance_operator: 'Ambulance operator',
};

// ─── Onboarding (Epic 1, 14-1) ───────────────────────────────────────────

export interface ClaimDocument {
  key: 'licence' | 'cac' | 'staff_id' | 'capacity' | string;
  label: string;
  fileName: string;
  /** Short-lived signed link from object storage; null when the file is not viewable here. */
  url: string | null;
  uploadedAt: string;
}

export interface ClaimApproval {
  adminId: string;
  adminName: string;
  at: string;
}

/** facilities.claim (server FacilityClaim), with names resolved for display. */
export interface Claim {
  legalName: string;
  licenceNumber: string;
  /** Null where the server does not capture it. */
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string;
  contactPhone: string | null;
  documents: ClaimDocument[];
  submittedAt: string;
  /** Two-person rule (1-4, §15 T18): two distinct platform admins. */
  approvals: ClaimApproval[];
  decision: 'approved' | 'rejected' | null;
  reason: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface ClaimSummary {
  facilityId: string;
  facilityName: string;
  type: FacilityType;
  lga: string;
  status: FacilityStatus;
  submittedAt: string;
  contactName: string | null;
  contactEmail: string;
  approvals: ClaimApproval[];
  decision: 'approved' | 'rejected' | null;
}

export interface ClaimDetail {
  facilityId: string;
  facilityName: string;
  type: FacilityType;
  ownership: Ownership;
  address: string;
  lga: string;
  location: { lat: number; lng: number } | null;
  registrySource: { name: string; recordId: string } | null;
  status: FacilityStatus;
  facilityCode: string | null;
  displayCode: string | null;
  claim: Claim;
}

export type ClaimView = 'pending' | 'decided';

export interface ApproveResult {
  claim: ClaimDetail;
  /** Set when this approval was the second one and the code was issued. */
  issued: { facilityCode: string; displayCode: string } | null;
}

// ─── Directory (14-2, 1-12) ──────────────────────────────────────────────

export interface FacilityRow {
  id: string;
  name: string;
  type: FacilityType;
  lga: string;
  status: FacilityStatus;
  facilityCode: string | null;
  displayCode: string | null;
  verifiedAt: string | null;
  /** Null where the server does not report it. */
  staffCount: number | null;
  suspension: { reason: string; at: string; by: string } | null;
}

export interface DirectoryFilter {
  q?: string;
  status?: FacilityStatus | '';
  type?: FacilityType | '';
}

// ─── Alerts (14-3, 14-5; server ALERT_TYPES) ─────────────────────────────

export type AlertType =
  | 'capability_mismatch'
  | 'accept_then_cancel'
  | 'price_anomaly'
  | 'payout_change'
  | 'repeated_failed_signin'
  | 'paid_after_cancellation'
  | 'payment_mismatch';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'open' | 'reviewing' | 'resolved';

export interface Alert {
  id: string;
  type: AlertType;
  facilityCode: string | null;
  facilityName: string | null;
  severity: AlertSeverity;
  /** Free-form per type; the console reads the keys it knows and lists the rest. */
  context: Record<string, unknown>;
  status: AlertStatus;
  createdAt: string;
  updatedAt: string;
}
