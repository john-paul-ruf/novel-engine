import { describe, it, expect } from 'vitest';
import { useFileChangeStore } from './fileChangeStore';
import { resetStoresBeforeEach } from '../../test/resetStores';

resetStoresBeforeEach(useFileChangeStore);

// NOTE: this store is a deliberately minimal monotonic counter — there is no
// per-book filtering or path dedupe here (chatStore's onFilesChanged handler
// decides WHEN to bump it; components re-fetch on every bump).
describe('fileChangeStore', () => {
  it('starts at revision 0', () => {
    expect(useFileChangeStore.getState().revision).toBe(0);
  });

  it('notifyChange increments the revision monotonically, once per call', () => {
    useFileChangeStore.getState().notifyChange();
    useFileChangeStore.getState().notifyChange();
    useFileChangeStore.getState().notifyChange();

    expect(useFileChangeStore.getState().revision).toBe(3);
  });
});
