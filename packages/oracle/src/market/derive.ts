// Markets are now defined declaratively in fixtures/markets.json and loaded via
// registry.ts. This module is kept as a thin re-export for backwards compat.
export { loadMarkets, loadCustomOutcomes, isResolvable } from './registry.ts';
