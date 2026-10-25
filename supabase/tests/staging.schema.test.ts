// Staging has the same schema as the migrations, including 0009: checked
// before the real-account tests mean anything. IDs: docs/test-cases/backend.md (BE-STAGING-*)
import { admin } from './local';

test('BE-STAGING-001 staging has every migration this app needs: consent (0007, 0008) and sync revisions (0009)', async () => {
  const sync = await admin().from('sync_records').select('rev, base_rev').limit(1);
  expect({ table: 'sync_records rev/base_rev (0009)', error: sync.error?.message ?? null }).toEqual({ table: 'sync_records rev/base_rev (0009)', error: null });
  const profiles = await admin().from('profiles').select('store_data_consent, store_data_consent_version, store_data_consent_source').limit(1);
  expect({ table: 'profiles consent (0007, 0008)', error: profiles.error?.message ?? null }).toEqual({ table: 'profiles consent (0007, 0008)', error: null });
});
