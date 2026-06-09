import type { OSSComponentDescriptor, RecoderComponentDescriptor } from '@recoder/oss-registry';
import { collectIssues, requireString, type SchemaGuard } from './schema-guard';

export const ossComponentSchema: SchemaGuard<OSSComponentDescriptor> = {
  name: 'OSSComponentDescriptor',
  parse(value) {
    return collectIssues<OSSComponentDescriptor>(value, 'OSSComponentDescriptor', [
      (record) => requireString(record, 'id'),
      (record) => requireString(record, 'name'),
      (record) => requireString(record, 'kind'),
      (record) => requireString(record, 'contract'),
      (record) => requireString(record, 'patchPolicy'),
    ]);
  },
};

export const recoderComponentSchema: SchemaGuard<RecoderComponentDescriptor> = {
  name: 'RecoderComponentDescriptor',
  parse(value) {
    return collectIssues<RecoderComponentDescriptor>(value, 'RecoderComponentDescriptor', [
      (record) => requireString(record, 'id'),
      (record) => requireString(record, 'name'),
      (record) => requireString(record, 'origin'),
      (record) => requireString(record, 'contract'),
      (record) => requireString(record, 'status'),
    ]);
  },
};
