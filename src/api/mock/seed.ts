// Example data for the mock adapter. Every facility, person and email here is
// fictional. Verified facilities match mobile/src/api/mock/seed.ts (codes and names)
// so the demo reads as one network. No real facility is named.

import type { Alert, Claim, FacilityStatus, FacilityType, Ownership } from '../types';

export interface MockAdmin {
  id: string;
  name: string;
  email: string;
}

export interface MockFacility {
  id: string;
  name: string;
  type: FacilityType;
  ownership: Ownership;
  address: string;
  lga: string;
  location: { lat: number; lng: number } | null;
  registrySource: { name: string; recordId: string } | null;
  status: FacilityStatus;
  facilityCode: string | null;
  displayCode: string | null;
  verifiedAt: string | null;
  staffCount: number;
  claim: Claim | null;
  suspension: { reason: string; at: string; by: string } | null;
}

export interface MockDb {
  admins: MockAdmin[];
  facilities: MockFacility[];
  alerts: Alert[];
  /** counters.facility_code — atomic $inc on the server; never max+1. */
  counter: number;
}

const daysAgo = (d: number, h = 9) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, 0, 0, 0);
  return t.toISOString();
};

const REG = 'Example registry';

function docs(at: string, withCac: boolean): Claim['documents'] {
  const list: Claim['documents'] = [
    { key: 'licence', label: 'Healthcare facility licence', fileName: 'facility-licence.pdf', url: null, uploadedAt: at },
    { key: 'staff_id', label: 'Claimant staff ID', fileName: 'staff-id.jpg', url: null, uploadedAt: at },
  ];
  if (withCac) list.push({ key: 'cac', label: 'CAC certificate', fileName: 'cac-certificate.pdf', url: null, uploadedAt: at });
  return list;
}

/** Same example rule as mobile/src/api/mock/seed.ts (weighted digit sum mod 10). G4 has not fixed the real one. */
export function checkDigit(seq: string): number {
  return seq.split('').reduce((sum, d, i) => sum + Number(d) * (i + 2), 0) % 10;
}

function verified(
  id: string,
  code: string,
  kind: 'HOS' | 'PEC',
  name: string,
  type: FacilityType,
  ownership: Ownership,
  lga: string,
  address: string,
  staffCount: number,
): MockFacility {
  return {
    id,
    name,
    type,
    ownership,
    address,
    lga,
    location: null,
    registrySource: { name: REG, recordId: id.toUpperCase() },
    status: 'verified',
    facilityCode: code,
    displayCode: `ET-${kind}-LAG-${code}-${checkDigit(code)}`,
    verifiedAt: daysAgo(40),
    staffCount,
    claim: null,
    suspension: null,
  };
}

export function seed(): MockDb {
  const admins: MockAdmin[] = [
    { id: 'pa-bakare', name: 'Tolu Bakare', email: 't.bakare@example.ng' },
    { id: 'pa-nwosu', name: 'Ifeoma Nwosu', email: 'i.nwosu@example.ng' },
  ];

  const pending = (
    id: string,
    name: string,
    type: FacilityType,
    ownership: Ownership,
    lga: string,
    address: string,
    claim: Partial<Claim> & Pick<Claim, 'contactName' | 'contactEmail' | 'submittedAt'>,
  ): MockFacility => ({
    id,
    name,
    type,
    ownership,
    address,
    lga,
    location: null,
    registrySource: { name: REG, recordId: id.toUpperCase() },
    status: 'claim_pending',
    facilityCode: null,
    displayCode: null,
    verifiedAt: null,
    staffCount: 0,
    suspension: null,
    claim: {
      legalName: name,
      licenceNumber: `HEF/EX/${id.slice(-4).toUpperCase()}`,
      contactRole: 'Facility Administrator',
      contactPhone: '0800 000 0000',
      documents: docs(claim.submittedAt, ownership === 'private'),
      approvals: [],
      decision: null,
      reason: null,
      decidedAt: null,
      decidedBy: null,
      ...claim,
    },
  });

  const facilities: MockFacility[] = [
    pending('reg-1003', 'Mainland Trauma & Emergency Centre', 'clinic', 'private', 'Lagos Mainland', '22 Commercial Ave, Yaba (example)', {
      contactName: 'Dr. Kunle Ajayi',
      contactRole: 'Medical Director',
      contactEmail: 'k.ajayi@example.ng',
      submittedAt: daysAgo(3, 11),
      // One approval already in: a second, different admin completes it.
      approvals: [{ adminId: 'pa-nwosu', adminName: 'Ifeoma Nwosu', at: daysAgo(1, 15) }],
    }),
    pending('reg-1005', 'Lekki Shoreline Medical Centre', 'hospital', 'private', 'Ibeju-Lekki', 'Km 18 Lekki-Epe Expressway (example)', {
      contactName: 'Amaka Obi',
      contactEmail: 'a.obi@example.ng',
      submittedAt: daysAgo(2, 10),
    }),
    pending('reg-1002', 'Ikoyi Crest Specialist Hospital', 'hospital', 'private', 'Eti-Osa', '7 Crest Rd, Ikoyi (example)', {
      contactName: 'Segun Martins',
      contactRole: 'Matron',
      contactEmail: 's.martins@example.ng',
      submittedAt: daysAgo(1, 8),
    }),
    {
      ...pending('reg-1008', 'Festac Lifeline Hospital', 'hospital', 'private', 'Amuwo-Odofin', '21 Road, Festac (example)', {
        contactName: 'J. Etim',
        contactEmail: 'j.etim@example.ng',
        submittedAt: daysAgo(9, 12),
        decision: 'rejected',
        reason: 'Licence number could not be matched to the registry record. Asked the claimant to resubmit with the current licence.',
        decidedAt: daysAgo(6, 14),
        decidedBy: 'Tolu Bakare',
      }),
      status: 'unclaimed',
    },
    verified('reg-0142', '0142', 'HOS', 'Harbourview General', 'hospital', 'general', 'Mushin', 'Idi-Araba (example)', 14),
    verified('reg-0187', '0187', 'HOS', 'Marina Teaching Hospital', 'hospital', 'general', 'Ikeja', 'Ikeja (example)', 22),
    verified('reg-0053', '0053', 'PEC', 'Crestview VI', 'clinic', 'private', 'Eti-Osa', 'Victoria Island (example)', 9),
    verified('reg-0076', '0076', 'PEC', 'Greenfield Gbagada', 'clinic', 'private', 'Kosofe', 'Gbagada (example)', 7),
    verified('reg-0318', '0318', 'HOS', 'Westgate Alimosho', 'hospital', 'general', 'Alimosho', 'Idimu (example)', 11),
    {
      ...verified('reg-0301', '0301', 'HOS', 'Riverside Ikorodu', 'hospital', 'general', 'Ikorodu', 'Ikorodu (example)', 8),
      status: 'suspended',
      suspension: {
        reason: 'Repeated accept-then-cancel on critical referrals; under review with the facility.',
        at: daysAgo(4, 16),
        by: 'Ifeoma Nwosu',
      },
    },
  ];

  const alerts: Alert[] = [
    {
      id: 'al-1',
      type: 'capability_mismatch',
      facilityCode: '0076',
      facilityName: 'Greenfield Gbagada',
      severity: 'critical',
      context: {
        caseNumber: 'TR-EX-0091',
        declared: 'ICU bed available, ventilator available',
        found: 'Escort reported no ventilator on arrival',
      },
      status: 'open',
      createdAt: daysAgo(0, 7),
      updatedAt: daysAgo(0, 7),
    },
    {
      id: 'al-2',
      type: 'accept_then_cancel',
      facilityCode: '0053',
      facilityName: 'Crestview VI',
      severity: 'warning',
      context: { cancellations7d: 3, accepted7d: 5, lastCaseNumber: 'TR-EX-0088' },
      status: 'open',
      createdAt: daysAgo(1, 13),
      updatedAt: daysAgo(1, 13),
    },
    {
      id: 'al-3',
      type: 'payout_change',
      facilityCode: '0187',
      facilityName: 'Marina Teaching Hospital',
      severity: 'warning',
      context: { bank: 'Example Bank', last4: '4417', holdUntil: daysAgo(-2, 9), callBack: 'Not yet done' },
      status: 'reviewing',
      createdAt: daysAgo(0, 9),
      updatedAt: daysAgo(0, 10),
    },
    {
      id: 'al-4',
      type: 'accept_then_cancel',
      facilityCode: '0301',
      facilityName: 'Riverside Ikorodu',
      severity: 'critical',
      context: { cancellations7d: 6, accepted7d: 7, action: 'Facility suspended' },
      status: 'resolved',
      createdAt: daysAgo(5, 11),
      updatedAt: daysAgo(4, 16),
    },
  ];

  return { admins, facilities, alerts, counter: 318 };
}
