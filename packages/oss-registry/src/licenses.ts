export type OSSLicenseRecord = {
  componentId: string;
  license: string;
  source: 'declared' | 'package' | 'manual' | 'unknown';
  reviewedAt?: string;
};

export function findUnreviewedLicenses(records: OSSLicenseRecord[]): OSSLicenseRecord[] {
  return records.filter((record) => !record.reviewedAt || record.license === 'unknown');
}
