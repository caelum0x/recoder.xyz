#!/usr/bin/env node
/**
 * Create (idempotently) the three Recoder Connect subscription products in
 * Dodo Payments: Pro $29/mo, Pro Annual $290/yr, Team $99/mo
 * (plans/recoder-connect.md). NOT run by any build/deploy step — this is an
 * owner/operator-run, one-time setup script.
 *
 * Gated behind DODO_API_KEY_LIVE / DODO_API_KEY_TEST (env.example,
 * .env.production.secure-template naming): with neither set, this exits
 * immediately with a clear message and makes zero network calls — there is
 * no confirmed Dodo business/API key for Recoder specifically yet (the only
 * Dodo key on this machine as of 2026-10-15 is a generic, unlabeled key not
 * referenced by any product's env — see plans/recoder-connect.md "Owner
 * tasks"). Run with real keys once that's resolved:
 *
 *   DODO_API_KEY_LIVE=... node --import tsx app/scripts/dodo-create-products.ts
 *   DODO_API_KEY_TEST=... node --import tsx app/scripts/dodo-create-products.ts --test
 *
 * Idempotent: lists existing products first and skips creating any whose
 * name already matches, so re-running after a partial failure never creates
 * duplicates. Prints the product ids to paste into DODO_PRODUCT_PRO,
 * DODO_PRODUCT_PRO_ANNUAL, DODO_PRODUCT_TEAM (the same env var names
 * app/app/api/billing/create-checkout/route.ts and
 * app/lib/payments/dodo-provider.ts already read).
 */

interface ProductSpec {
  readonly envVar: string;
  readonly name: string;
  readonly description: string;
  readonly priceCents: number;
  readonly interval: 'month' | 'year';
}

const PRODUCTS: readonly ProductSpec[] = [
  {
    envVar: 'DODO_PRODUCT_PRO',
    name: 'Recoder Pro',
    description: 'Recoder Connect — remote reach, hosted web, multi-device, governed-skills catalog. Billed monthly.',
    priceCents: 2900,
    interval: 'month',
  },
  {
    envVar: 'DODO_PRODUCT_PRO_ANNUAL',
    name: 'Recoder Pro (Annual)',
    description: 'Recoder Pro billed yearly (2 months free vs. monthly).',
    priceCents: 29000,
    interval: 'year',
  },
  {
    envVar: 'DODO_PRODUCT_TEAM',
    name: 'Recoder Team',
    description: 'Recoder Connect for teams — shared environments, org policy, seat pooling. Billed monthly.',
    priceCents: 9900,
    interval: 'month',
  },
];

interface DodoProduct {
  readonly product_id: string;
  readonly name?: string;
}

interface DodoProductListResponse {
  readonly items?: readonly DodoProduct[];
}

export function resolveApiKey(testMode: boolean): string | null {
  // `||`, not `??` — an env var set to the empty string (common when a
  // template placeholder is sourced but never filled in) must be treated as
  // absent, never as a configured-but-blank key.
  if (testMode) return process.env.DODO_API_KEY_TEST || null;
  return process.env.DODO_API_KEY_LIVE || process.env.DODO_PAYMENTS_API_KEY || null;
}

export function resolveBaseUrl(): string {
  return process.env.DODO_API_BASE_URL?.trim() || 'https://api.dodopayments.com';
}

export async function listExistingProducts(
  baseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly DodoProduct[]> {
  const response = await fetchImpl(`${baseUrl}/products`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Dodo GET /products failed: HTTP ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as DodoProductListResponse;
  return data.items ?? [];
}

export async function createProduct(
  baseUrl: string,
  apiKey: string,
  spec: ProductSpec,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(`${baseUrl}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      name: spec.name,
      description: spec.description,
      price: {
        type: 'recurring_price',
        price: spec.priceCents,
        currency: 'USD',
        payment_frequency_interval: spec.interval === 'month' ? 'Month' : 'Year',
        payment_frequency_count: 1,
        subscription_period_interval: spec.interval === 'month' ? 'Month' : 'Year',
        subscription_period_count: 1,
      },
      tax_category: 'saas',
    }),
  });
  if (!response.ok) {
    throw new Error(`Dodo POST /products failed for "${spec.name}": HTTP ${response.status} ${await response.text()}`);
  }
  const created = (await response.json()) as DodoProduct;
  return created.product_id;
}

/**
 * Idempotently ensure every product in {@link PRODUCTS} exists: skip any
 * whose name already matches an existing product, create the rest. Returns
 * `envVar -> productId` for every spec, found or newly created.
 */
export async function syncDodoProducts(
  baseUrl: string,
  apiKey: string,
  log: (message: string) => void = console.log,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, string>> {
  const existing = await listExistingProducts(baseUrl, apiKey, fetchImpl);
  const results: Record<string, string> = {};

  for (const spec of PRODUCTS) {
    const match = existing.find((p) => p.name === spec.name);
    if (match) {
      log(`[skip] "${spec.name}" already exists -> ${match.product_id}`);
      results[spec.envVar] = match.product_id;
      continue;
    }
    const productId = await createProduct(baseUrl, apiKey, spec, fetchImpl);
    log(`[created] "${spec.name}" -> ${productId}`);
    results[spec.envVar] = productId;
  }

  return results;
}

async function main(): Promise<void> {
  const testMode = process.argv.includes('--test');
  const apiKey = resolveApiKey(testMode);

  if (!apiKey) {
    console.error(
      `No Dodo API key configured (checked ${
        testMode ? 'DODO_API_KEY_TEST' : 'DODO_API_KEY_LIVE / DODO_PAYMENTS_API_KEY'
      }). Nothing was created. See plans/recoder-connect.md "Owner tasks": create a Dodo ` +
        'business for Recoder and set the real key before running this script.',
    );
    process.exitCode = 1;
    return;
  }

  const baseUrl = resolveBaseUrl();
  console.log(`Using Dodo ${testMode ? 'TEST' : 'LIVE'} mode at ${baseUrl}`);

  const results = await syncDodoProducts(baseUrl, apiKey);

  console.log('\nSet these env vars (wrangler secret put / .env.production):');
  for (const spec of PRODUCTS) {
    console.log(`${spec.envVar}=${results[spec.envVar]}`);
  }
}

// Only auto-run when executed directly (`node --import tsx
// dodo-create-products.ts`), never on import — this keeps the module
// test-importable without side effects.
const isDirectExecution =
  typeof process.argv[1] === 'string' && process.argv[1].endsWith('dodo-create-products.ts');
if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
