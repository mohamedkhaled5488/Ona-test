import { useSyncExternalStore } from 'react';
import { getDataSpace, onDataSpaceChange, type DataSpace } from '../utils/dataSpace';

// The current data space ('real' or 'demo'), re-rendering when it changes.
export function useDataSpace(): DataSpace {
  return useSyncExternalStore(onDataSpaceChange, getDataSpace, getDataSpace);
}
