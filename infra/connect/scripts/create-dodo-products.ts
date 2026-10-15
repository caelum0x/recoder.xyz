#!/usr/bin/env -S npx tsx
/**
 * Creates (or verifies) the three Recoder Connect Dodo products via the Dodo
 * API: Pro $29/mo, Pro annual $290/yr, Team $99/mo. Idempotent by name — a
 * second run against the same account does not create duplicates, it just
 * reprints the existing ids.
 *
 * Gated on `RECODER_CONNECT_DODO_API_KEY`: if it is not set (true today — no
 * Dodo business exists for Recoder yet per
 * ~/products/plans/recoder-connect.md owner tasks), this prints exactly what
 * is missing and exits 0 WITHOUT calling the network — never a silent no-op,
 * never a crash in CI.
 */
const API_KEY = process.env.RECODER_CONNECT_DODO_API_KEY;
const TEST_MODE = process.env.RECODER_CONNECT_DODO_TEST_MODE !== 'false';
const BASE_URL = TEST_MODE ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com';

interface ProductSpec {
  readonly envVar: string;
  readonly name: string;
  readonly description: string;
  readonly price: number; // smallest currency unit (cents)
  readonly currency: 'USD';
  readonly interval: 'Month' | 'Year';
}

const PRODUCTS: readonly ProductSpec[] = [
  {
    envVar: 'RECODER_CONNECT_DODO_PRODUCT_PRO_MONTHLY',
    name: 'Recoder Pro (monthly)',
    description: 'Recoder Connect — remote reach, managed tunnel, hosted web, mobile push, governed-skills catalog.',
    price: 2900,
    currency: 'USD',
    interval: 'Month',
  },
  {
    envVar: 'RECODER_CONNECT_DODO_PRODUCT_PRO_ANNUAL',
    name: 'Recoder Pro (annual)',
    description: 'Recoder Connect Pro, billed annually (2 months free vs. monthly).',
    price: 29000,
    currency: 'USD',
    interval: 'Year',
  },
  {
    envVar: 'RECODER_CONNECT_DODO_PRODUCT_TEAM_MONTHLY',
    name: 'Recoder Team (monthly)',
    description: 'Recoder Connect Team — shared environments, org policy, everything in Pro.',
    price: 9900,
    currency: 'USD',
    interval: 'Month',
  },
];

async function main(): Promise<void> {
  if (!API_KEY) {
    console.log('RECODER_CONNECT_DODO_API_KEY is not set — nothing to do.');
    console.log('Owner action queued (see plans/recoder-connect.md): create a Dodo Payments business for');
    console.log('Recoder, mint a test-mode API key, set RECODER_CONNECT_DODO_API_KEY, then rerun');
    console.log('`pnpm dodo:sync-products` from infra/connect.');
    for (const p of PRODUCTS) console.log(`  - will create: ${p.name} ($${(p.price / 100).toFixed(2)}/${p.interval.toLowerCase()})`);
    return;
  }

  console.log(`Syncing ${PRODUCTS.length} Dodo products (${TEST_MODE ? 'TEST' : 'LIVE'} mode, ${BASE_URL})`);
  const results: Record<string, string> = {};
  for (const product of PRODUCTS) {
    const id = await findOrCreateProduct(product);
    results[product.envVar] = id;
    console.log(`  ${product.envVar}=${id}`);
  }
  console.log('\nAdd these to infra/connect/wrangler.jsonc under "vars" (not secret — product ids are public):');
  for (const [k, v] of Object.entries(results)) console.log(`  "${k}": "${v}",`);
}

async function findOrCreateProduct(spec: ProductSpec): Promise<string> {
  const listResponse = await fetch(`${BASE_URL}/products?page_size=100`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (listResponse.ok) {
    const list = (await listResponse.json()) as { items?: Array<{ product_id?: string; name?: string }> };
    const existing = list.items?.find((item) => item.name === spec.name);
    if (existing?.product_id) return existing.product_id;
  }

  const createResponse = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      name: spec.name,
      description: spec.description,
      price: {
        type: 'recurring_price',
        price: spec.price,
        currency: spec.currency,
        payment_frequency_count: 1,
        payment_frequency_interval: spec.interval,
        subscription_period_count: 1,
        subscription_period_interval: spec.interval,
      },
      tax_category: 'saas',
    }),
  });
  if (!createResponse.ok) {
    const body = await createResponse.text().catch(() => '');
    throw new Error(`failed to create product "${spec.name}": ${createResponse.status} ${body.slice(0, 300)}`);
  }
  const created = (await createResponse.json()) as { product_id?: string };
  if (!created.product_id) throw new Error(`product creation for "${spec.name}" did not return a product_id`);
  return created.product_id;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
