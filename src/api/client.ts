import type {
  Alert,
  AlertStatus,
  ApproveResult,
  ClaimDetail,
  ClaimSummary,
  ClaimView,
  DirectoryFilter,
  FacilityRow,
  OtpRequest,
  OtpVerify,
  Session,
} from './types';

/**
 * Everything the platform-admin console asks of the server. Two implementations:
 * `live` (HTTP against server/) and `mock` (in-browser, example data). Pages only
 * see this interface. The facility console's client follows the same pattern.
 */
export interface ApiClient {
  /**
   * What this adapter can actually do. The mock does everything; the live server
   * does not serve every console feature yet, and pages show an honest
   * "not available on the server yet" state where a flag is false.
   */
  capabilities: Capabilities;
  auth: {
    /** Always resolves the same way, whether or not the account exists (no enumeration). */
    requestOtp(input: OtpRequest): Promise<void>;
    verifyOtp(input: OtpVerify): Promise<Session>;
    switchAccount(facilityCode: string): Promise<Session>;
    logout(): Promise<void>;
  };
  claims: {
    list(view: ClaimView): Promise<ClaimSummary[]>;
    get(facilityId: string): Promise<ClaimDetail>;
    /** Records this admin's approval. The second distinct approval issues the code. */
    approve(facilityId: string): Promise<ApproveResult>;
    reject(facilityId: string, reason: string): Promise<ClaimDetail>;
  };
  facilities: {
    list(filter: DirectoryFilter): Promise<FacilityRow[]>;
    /** Blocks new transfers; in-flight cases finish; sessions are revoked (1-12, §3). */
    suspend(facilityId: string, reason: string): Promise<FacilityRow>;
    reinstate(facilityId: string): Promise<FacilityRow>;
  };
  alerts: {
    list(status?: AlertStatus): Promise<Alert[]>;
    setStatus(alertId: string, status: AlertStatus): Promise<Alert>;
  };
  /** Mock only: demo helpers. Undefined against a live server. */
  demo?: DemoControls;
}

export interface Capabilities {
  /** A list of approved and rejected claims (the server lists pending claims only). */
  decidedClaims: boolean;
  /** Suspended facilities appear in the directory, so they can be reinstated from it. */
  suspendedInDirectory: boolean;
  /** Alerts can be moved between open, reviewing and resolved. */
  alertStatus: boolean;
}

export const ALL_CAPABILITIES: Capabilities = { decidedClaims: true, suspendedInDirectory: true, alertStatus: true };

export interface DemoControls {
  personas(): { name: string; email: string; facilityCode?: string; note: string }[];
  reset(): void;
}

export type ApiModule = Exclude<keyof ApiClient, 'demo' | 'capabilities'>;
