// Kept as the existing workflow entry point. Community UsageCost is preserved
// as declared text, never promoted to a verified zero-price routing tariff.
// Exact connector, tax, access and session-fee verification remains in
// merge-verified-prices.mjs. Approximate hand-authored locations are not imported.
import {importInternational} from './import-international.mjs';
import path from 'node:path';
const root=process.env.OCM_ES_DIR?path.dirname(process.env.OCM_ES_DIR):process.env.OCM_DATA_DIR||'/tmp/ocm-export/data';
console.log('OCM Spain:',JSON.stringify(importInternational({root,countries:['ES']})));
