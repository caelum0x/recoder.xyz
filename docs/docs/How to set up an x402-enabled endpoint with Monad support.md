https://docs.monad.xyz/guides/x402-guide
What is x402?
x402 is the HTTP 402 "Payment Required" status code reborn as a minimal protocol for internet‑native micropayments.

Instead of subscriptions or paywalls that require accounts, x402 lets any HTTP endpoint become instantly payable:

Client requests a resource
Server responds 402 with a small JSON payment requirement
Client pays with a signed transaction
Server verifies and serves the content
Beyond legacy limitations
x402 is designed for a modern internet economy, solving key limitations of legacy systems:

Reduce fees and friction: Direct onchain payments without intermediaries, high fees, or manual setup.
Micropayments & usage-based billing: Charge per call or feature with simple, programmable pay-as-you-go flows.
Machine-to-machine transactions: Let AI agents pay and access services autonomously with no keys or human input needed.
Why x402 on Monad?
Monad is a fully EVM‑compatible Layer 1 with:

10,000 TPS
~0.4s block times
Single‑slot finality
Parallel execution
Extremely low fees
These properties make Monad an ideal environment for true micropayments and agent-to-agent commerce. Payments settle instantly at low cost and avoid mempool congestion, perfect when many AI agents pay per API call.

Core Flow (Direct Payment)
Monad Chain
Server
Client
Monad Chain
Server
Client
Build & sign ERC-20 transfer tx
GET /premium-content
402 Payment Required + requirements JSON
GET /premium-content
(X-Payment header = base64(payload))
Broadcast raw tx
Confirmed receipt
200 OK + content
Facilitator Flow (Recommended for Production)
A facilitator service is optional but recommended in production. Facilitators can batch transactions, cover gas, handle refunds, and simplify client logic.

Monad Chain
Facilitator
Server
Client
Monad Chain
Facilitator
Server
Client
Facilitator is optional but solves gas,
refunds, batching, and replay protection
GET /premium-content
402 + requirements JSON + facilitator URL
POST /settle (signed tx or intent)
Broadcast tx (covers gas if gasless)
Confirmed
200 + receipt / paymentID
GET /premium-content
(X-Payment-Receipt: receipt-or-id)
GET /verify?payment_id=...
200 Valid (or 402 invalid/expired)
200 OK + content
Building an x402-based app using Thirdweb facilitator
Prerequisites
Node.js 18+
An EVM wallet
Access to Monad testnet funds (USDC test tokens below)
How to get USDC tokens on Monad testnet
Step 1: Initialize a Next.js App
Create a new Next.js project:

npx create-next-app@latest my-x402-app

When prompted, select the following options:

✅ TypeScript
✅ ESLint
✅ Tailwind CSS
✅ src/ directory
✅ App Router
✅ Customize default import alias: @/* (default)
Navigate to your project:

cd my-x402-app

Install the Thirdweb SDK:

npm install thirdweb

Create a .env.local file for your environment variables:

touch .env.local

Step 2: Create a Thirdweb account and get your API keys
Go to https://thirdweb.com/dashboard

Sign in (wallet or email/Google)

Create a project

Go to Settings → API Keys

You'll see two keys:

Client ID (for frontend)
Secret Key (for backend - keep this secure!)
Add to your .env.local file:

NEXT_PUBLIC_CLIENT_ID=your_client_id_here
SECRET_KEY=your_secret_key_here

thirdweb_keys

Step 3: Create a server wallet
A server wallet can be used to receive payments and interact with the blockchain from your backend.

In your Thirdweb dashboard, expand Wallets in the sidebar and click Server Wallets

Click the Wallets tab

You should already see a Project Wallet by default, or you can create a new one

Copy the wallet address and add it to your .env.local file as SERVER_WALLET

NEXT_PUBLIC_CLIENT_ID=your_client_id_here
SECRET_KEY=your_secret_key_here
SERVER_WALLET=0xYourWallet

server_wallet

Step 4: Create a server side payable endpoint
route.ts
src > app > api > premium
import { NextResponse } from "next/server";
import { createThirdwebClient } from "thirdweb";
import { facilitator, settlePayment } from "thirdweb/x402";
import { monadTestnet } from "thirdweb/chains";

const client = createThirdwebClient({ secretKey: process.env.SECRET_KEY });

const thirdwebX402Facilitator = facilitator({
  client,
  serverWalletAddress: process.env.SERVER_WALLET,
});

export async function GET(request: Request) {
    try {
        const paymentData = request.headers.get("x-payment");

        const result = await settlePayment({
            resourceUrl: "http://localhost:3000/api/premium", // change to your production URL
            method: "GET",
            paymentData,
            network: monadTestnet, // payable on monad testnet
            price: "$0.0001", // Amount per request
            payTo: process.env.SERVER_WALLET!, // payment receiver
            facilitator: thirdwebX402Facilitator,
        });

        if (result.status === 200) {
            // If payment is settled, return paid response
            return NextResponse.json({ message: "Payment successful!", tx: result.paymentReceipt });
        } else {
            // send payment status
            return new NextResponse(
            JSON.stringify(result.responseBody),
                {
                    status: result.status,
                    headers: { "Content-Type": "application/json", ...(result.responseHeaders || {}) },
                }
            );
        }
    } catch(error) {
        console.error(error);
        
        return new NextResponse(
            JSON.stringify({ error: "server error" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
}

Step 5: Client-side setup (consuming paid endpoint)
Below is an example of consuming the paid endpoint using a Next.js app, however the endpoint can be consumed via an agent script as well.

page.tsx
src > app
"use client";

import { useState } from "react";
import { createThirdwebClient } from "thirdweb";
import { wrapFetchWithPayment } from "thirdweb/x402";
import { createWallet } from "thirdweb/wallets";

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_CLIENT_ID || "YOUR_PUBLIC_CLIENT_ID",
});

export default function Home() {
  const [message, setMessage] = useState("Pay $0.0001 USDC to unlock premium content");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const payAndFetch = async () => {
    setStatus("loading");
    setMessage("Connecting wallet...");
    try {
      const wallet = createWallet("io.metamask");
      await wallet.connect({ client });
      setMessage("Wallet connected — paying...");

      const fetchPay = wrapFetchWithPayment(fetch, client, wallet);
      const res = await fetchPay("/api/premium");
      const json = await res.json();

      setStatus("success");
      setMessage(json.message || "Payment successful!");
    } catch (e: any) {
      setStatus("error");
      setMessage(e.message);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">x402 on Monad</h1>
          <p className="text-zinc-400 text-sm">
            Micropayments via Thirdweb facilitator.{" "}
            <a href="https://docs.monad.xyz/guides/x402-guide" className="text-violet-400 hover:underline">
              Docs
            </a>
          </p>
        </div>

        <button
          onClick={payAndFetch}
          disabled={status === "loading"}
          className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:cursor-wait text-white font-medium rounded-lg transition-colors"
        >
          {status === "loading" ? "Processing..." : "Pay & Unlock Content"}
        </button>

        <div className={`p-4 rounded-lg text-sm ${
          status === "error" ? "bg-red-950 text-red-300" :
          status === "success" ? "bg-green-950 text-green-300" :
          "bg-zinc-900 text-zinc-300"
        }`}>
          {message}
        </div>
      </div>
    </main>
  );
}

Running Your x402 App
Now you're ready to test your x402 payment flow:

Start your development server:

npm run dev

Open http://localhost:3000 in your browser

Click "Pay & Unlock Content"

Connect your wallet

Approve the USDC payment

See the content unlock instantly!

What's Next?
You've successfully built an x402 payment-enabled app on Monad! Here are some ideas to extend your implementation:

Add more payable endpoints - Create different pricing tiers for various content or API calls
Build AI agent integrations - Enable autonomous agents to pay for and access your APIs
Resources
Thirdweb x402 Documentation
x402 Protocol Specification
Monad Developer Discord
https://docs.monad.xyz/guides/x402-guide