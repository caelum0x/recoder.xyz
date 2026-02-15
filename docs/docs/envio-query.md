How to query token data with Envio HyperSync
In this guide, you will learn how to efficiently compute token ownership for ERC-721, ERC-20, and ERC-1155 contracts on Monad, using Envio HyperSync to accelerate the process.

Background
A common problem for EVM developers is the "historical balance problem" - recovering the full mapping of accounts to balances for an ERC-20, ERC-721, or ERC-1155 token. Solidity doesn't keep track of the keys in a mapping; values are stored in the appropriate storage slot after hashing the key. Therefore, to recover the balances, a typical strategy is to replay all transfer events for that token and compute the rolling sum.

Envio HyperSync is an indexer that allows developers to query millions of blockchain events in seconds. In this guide, we'll use data from HyperSync to reconstruct the historical balances for a token.

Prerequisites
Node.js 18+
Free HyperSync API key from envio.dev/app/api-tokens
HyperSync Endpoints
Network	URL
Testnet	
https://monad-testnet.hypersync.xyz

Mainnet	
https://monad.hypersync.xyz

Ingredients
This guide surveys how to reconstruct balances for all three of the most popular token standards - ERC-20, ERC-721, and ERC-1155. Each uses some common ingredients, while requiring different logic to assemble the end reuslt.

Querying Transfer Events
First, let's write some code to query all of the Transfer events for our contract, filtering for the appropriate signature.

ERC-20 and ERC-721 use the Transfer event below, while ERC-1155 uses the TransferSingle and TransferBatch events:

Event	Signature
Transfer(address,address,uint256)	0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
TransferSingle(address,address,address,uint256,uint256)	0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62
TransferBatch(address,address,address,uint256[],uint256[])	0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb
signatures.ts
lib
// ERC-20 and ERC-721 share the same Transfer signature
const TRANSFER_EVENT = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ERC-1155 events
const TRANSFER_SINGLE = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const TRANSFER_BATCH = "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";

Here is code for querying the events for an ERC-20 contract:

hypersync.ts
lib
const HYPERSYNC_URL = "https://monad-testnet.hypersync.xyz";

// keccak256("Transfer(address,address,uint256)") - same for ERC-20 and ERC-721
const TRANSFER_SIGNATURE = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function queryTransfers(contractAddress: string, apiKey: string) {
  const response = await fetch(`${HYPERSYNC_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from_block: 0,
      logs: [
        {
          address: [contractAddress],
          topics: [[TRANSFER_SIGNATURE]],
        },
      ],
      field_selection: {
        log: ["topic0", "topic1", "topic2", "topic3", "data"],
      },
    }),
  });

  return response.json();
}

Field Selection
To optimize our queries, we should only request the fields we actually need. This reduces response size and speeds up queries significantly. Different token standards encode data in different topics:

ERC-721 (tokenId in topic3):

{ "log": ["topic0", "topic2", "topic3"] }

ERC-20 (value in data):

{ "log": ["topic0", "topic1", "topic2", "data"] }

ERC-1155 (id and value in data):

{ "log": ["topic0", "topic1", "topic2", "topic3", "data"] }

Parsing Log Data
Now that we have the raw event data, we need to parse it into usable values. Topics are 32-byte hex strings where addresses are left-padded with zeros, occupying the last 20 bytes:

parse.ts
lib
function parseAddress(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

function parseTokenId(topic: string): string {
  return BigInt(topic).toString();
}

function parseValue(data: string): bigint | null {
  if (!data || data === "0x") return null;
  return BigInt(data);
}

Note: parseValue returns the raw token value as a bigint. ERC-20 tokens have a decimals property (typically 18) — divide by 10n ** BigInt(decimals) to convert to a human-readable amount.

Pagination
HyperSync returns paginated results to handle large datasets efficiently. We need to continue querying until next_block is undefined to get all transfers:

paginate.ts
lib
async function fetchAllTransfers(contractAddress: string, apiKey: string) {
  const ownership = new Map<string, string>();
  let fromBlock = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await queryHypersync(contractAddress, fromBlock, apiKey);

    // Process logs
    for (const block of response.data) {
      for (const log of block.logs) {
        const to = parseAddress(log.topic2);
        const tokenId = parseTokenId(log.topic3);
        ownership.set(tokenId, to);
      }
    }

    // Check for more pages
    if (response.next_block && response.next_block > fromBlock) {
      fromBlock = response.next_block;
    } else {
      hasMore = false;
    }
  }

  return ownership;
}

Now we can start putting it all together.

ERC-721 Balance Snapshot
For ERC-721, we will reconstruct the current ownership state by replaying all Transfer events. For NFTs, the last transfer for each token ID determines the current owner:

route.ts
app > api > snapshot
import { NextRequest, NextResponse } from "next/server";

const HYPERSYNC_URL = "https://monad-testnet.hypersync.xyz";

// keccak256("Transfer(address,address,uint256)") - same for ERC-20 and ERC-721
const TRANSFER_SIGNATURE = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function parseAddress(topic: string): string {
  return "0x" + topic.slice(-40).toLowerCase();
}

function parseTokenId(topic: string): string {
  return BigInt(topic).toString();
}

interface HypersyncLog {
  topic0: string;
  topic2: string;
  topic3: string;
}

interface HypersyncResponse {
  data: { logs: HypersyncLog[] }[];
  next_block?: number;
}

async function queryHypersync(
  contractAddress: string,
  fromBlock: number,
  apiKey: string
): Promise<HypersyncResponse> {
  const response = await fetch(`${HYPERSYNC_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from_block: fromBlock,
      logs: [{ address: [contractAddress], topics: [[TRANSFER_SIGNATURE]] }],
      field_selection: { log: ["topic0", "topic2", "topic3"] },
    }),
  });

  if (!response.ok) {
    throw new Error(`HyperSync error: ${response.status}`);
  }

  return response.json();
}

export async function GET(request: NextRequest) {
  const contract = request.nextUrl.searchParams.get("contract");
  const apiKey = process.env.HYPERSYNC_BEARER_TOKEN;

  if (!contract || !apiKey) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  // Track current owner for each tokenId
  const ownership = new Map<string, string>();
  let fromBlock = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await queryHypersync(contract, fromBlock, apiKey);

    for (const block of response.data) {
      for (const log of block.logs) {
        const to = parseAddress(log.topic2);
        const tokenId = parseTokenId(log.topic3);
        ownership.set(tokenId, to); // Last transfer wins
      }
    }

    if (response.next_block && response.next_block > fromBlock) {
      fromBlock = response.next_block;
    } else {
      hasMore = false;
    }
  }

  // Filter out burned tokens
  const snapshot = Array.from(ownership.entries())
    .filter(([, owner]) => owner !== ZERO_ADDRESS)
    .map(([tokenId, owner]) => ({ tokenId, owner }));

  return NextResponse.json({ snapshot });
}

ERC-20 Balance Snapshot
For ERC-20 tokens, we need to sum all transfers to calculate current balances. Unlike NFTs where we track ownership, ERC-20 balances require summing all incoming and outgoing transfers for each address.

First, query ERC-20 transfers with the right field selection (topic1 for from, topic2 for to, and data for the value):

erc20.ts
lib
async function queryERC20Transfers(
  contractAddress: string,
  fromBlock: number,
  apiKey: string
): Promise<HypersyncResponse> {
  const response = await fetch(`${HYPERSYNC_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from_block: fromBlock,
      logs: [{ address: [contractAddress], topics: [[TRANSFER_SIGNATURE]] }],
      field_selection: { log: ["topic0", "topic1", "topic2", "data"] },
    }),
  });

  if (!response.ok) {
    throw new Error(`HyperSync error: ${response.status}`);
  }

  return response.json();
}

Then reconstruct balances by summing all transfers:

erc20.ts
lib
async function getERC20Balances(contractAddress: string, apiKey: string) {
  const balances = new Map<string, bigint>();
  let fromBlock = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await queryERC20Transfers(contractAddress, fromBlock, apiKey);

    for (const block of response.data) {
      for (const log of block.logs) {
        const from = parseAddress(log.topic1);
        const to = parseAddress(log.topic2);
        const value = parseValue(log.data);

        if (value === null) continue;

        // Subtract from sender
        if (from !== ZERO_ADDRESS) {
          const current = balances.get(from) || 0n;
          balances.set(from, current - value);
        }

        // Add to receiver
        if (to !== ZERO_ADDRESS) {
          const current = balances.get(to) || 0n;
          balances.set(to, current + value);
        }
      }
    }

    if (response.next_block && response.next_block > fromBlock) {
      fromBlock = response.next_block;
    } else {
      hasMore = false;
    }
  }

  // Filter positive balances, sort descending
  return Array.from(balances.entries())
    .filter(([, balance]) => balance > 0n)
    .sort((a, b) => (b[1] > a[1] ? 1 : -1))
    .map(([address, balance]) => ({ address, balance: balance.toString() }));
}

ERC-1155 Balance Snapshot
ERC-1155 tokens work differently from ERC-20 and ERC-721. They store id and value in the data field rather than topics, requiring more complex parsing:

erc1155.ts
lib
// TransferSingle: data = id (32 bytes) + value (32 bytes)
function parseTransferSingle(data: string): { tokenId: string; value: bigint } | null {
  if (!data || data.length < 130) return null;
  const tokenId = BigInt("0x" + data.slice(2, 66)).toString();
  const value = BigInt("0x" + data.slice(66, 130));
  return { tokenId, value };
}

// TransferBatch: ABI-encoded arrays
function parseTransferBatch(data: string): { tokenId: string; value: bigint }[] | null {
  if (!data || data.length < 258) return null;

  // Decode offsets
  const idsOffset = Number(BigInt("0x" + data.slice(2, 66)));
  const valuesOffset = Number(BigInt("0x" + data.slice(66, 130)));

  // Read array lengths
  const idsLengthStart = 2 + idsOffset * 2;
  const idsLength = Number(BigInt("0x" + data.slice(idsLengthStart, idsLengthStart + 64)));

  const valuesLengthStart = 2 + valuesOffset * 2;
  const valuesLength = Number(BigInt("0x" + data.slice(valuesLengthStart, valuesLengthStart + 64)));

  if (idsLength !== valuesLength || idsLength === 0) return null;

  // Parse each id/value pair
  const results: { tokenId: string; value: bigint }[] = [];
  for (let i = 0; i < idsLength; i++) {
    const idStart = idsLengthStart + 64 + i * 64;
    const valueStart = valuesLengthStart + 64 + i * 64;
    const tokenId = BigInt("0x" + data.slice(idStart, idStart + 64)).toString();
    const value = BigInt("0x" + data.slice(valueStart, valueStart + 64));
    results.push({ tokenId, value });
  }

  return results;
}

Querying Multiple Event Types
When working with ERC-1155 tokens, we can optimize by querying both TransferSingle and TransferBatch events in a single request:

multi-event.ts
lib
const query = {
  from_block: 0,
  logs: [
    {
      address: [contractAddress],
      topics: [[TRANSFER_SINGLE, TRANSFER_BATCH]], // Both ERC-1155 events
    },
  ],
  field_selection: {
    log: ["topic0", "topic1", "topic2", "topic3", "data"],
  },
};

Then route based on topic0:

for (const log of block.logs) {
  if (log.topic0 === TRANSFER_SINGLE) {
    const parsed = parseTransferSingle(log.data);
    // handle single transfer...
  } else if (log.topic0 === TRANSFER_BATCH) {
    const parsed = parseTransferBatch(log.data);
    // handle batch transfer...
  }
}

Get Latest Block
To verify you've synced all available data, you can check the current chain height:

height.ts
lib
async function getLatestBlock(apiKey: string): Promise<number> {
  const response = await fetch(`${HYPERSYNC_URL}/height`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  const data = await response.json();
  return data.height;
}

Common Mistakes
1. Forgetting pagination
HyperSync returns partial results. Always check next_block:

// Wrong - only gets first page
const response = await queryHypersync(contract, 0);

// Right - loop until done
while (response.next_block) {
  // continue querying...
}

2. Requesting unused fields
Every field adds to response size. Be explicit:

// Wrong - fetches everything
field_selection: { log: ["*"] }

// Right - only what you need
field_selection: { log: ["topic0", "topic2", "topic3"] }

3. Using libraries for simple parsing
HyperSync returns raw hex. Native BigInt handles it:

// Unnecessary - adds dependency
import { decodeAbiParameters } from "viem";

// Sufficient - native JS
const value = BigInt("0x" + data.slice(2, 66));

4. Not filtering burned tokens
Address 0x000...000 means burned:

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Filter them out
const active = ownership.filter(([, owner]) => owner !== ZERO_ADDRESS);

API Reference
POST /query
Query event logs.

Request body:

Field	Type	Description
from_block	number	Starting block (inclusive)
to_block	number	Ending block (optional)
logs	array	Log filters
logs[].address	string[]	Contract addresses to filter
logs[].topics	string[][]	Topic filters (OR within array, AND across arrays)
field_selection.log	string[]	Fields to return
Response:

Field	Type	Description
data	array	Blocks containing matching logs
data[].logs	array	Matching logs in block
next_block	number	Next block to query (pagination)
GET /height
Get current chain height.

Response:

Field	Type	Description
height	number	Latest block number
Summary
Envio HyperSync lets you query any contract's event history across Monad with a single paginated API — no node to run, no indexer to maintain.

The /query endpoint accepts topic and address filters, and /height gives you the current chain tip. Check out the full HyperSync documentation for additional query types and options.

From here, you could extend this pattern to build airdrop eligibility checkers, governance voting power snapshots, or multi-token portfolio trackers.

Next Steps
Envio docs - Full HyperSync documentation
API tokens - Get your free API key
