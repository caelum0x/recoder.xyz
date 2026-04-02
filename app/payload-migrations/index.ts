import * as migration_20260402_232717_init_payload_cms from './20260402_232717_init_payload_cms';

export const migrations = [
  {
    up: migration_20260402_232717_init_payload_cms.up,
    down: migration_20260402_232717_init_payload_cms.down,
    name: '20260402_232717_init_payload_cms'
  },
];
