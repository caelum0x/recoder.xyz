Starting the indexer
Start Docker Desktop.

To start the indexer run the following command in the project directory:

pnpx envio dev

You should see something similar to the below image in your terminal; this means that the indexer is syncing and will eventually reach the tip of the chain.

envio indexer syncing
You will also see this page open in your browser automatically, the password is testing.

hasura local page
We can use this interface to query the indexer using GraphQL. Results will depend on the sync progress:

query interface

Currently, the indexer is catching up to the tip of the chain. Once syncing is complete the indexer will be able to identify latest WMON transfers.

We can shut down the indexer for now, so we can proceed with Telegram integration.

Creating the Telegram bot
Visit BotFather to create your bot and get an API token
Add these environment variables to your .env file:
ENVIO_BOT_TOKEN=<your_bot_token>
ENVIO_TELEGRAM_CHAT_ID=<your_chat_id>

To get your chat ID:

Create a Telegram group and add your bot
Send /start to the bot: @YourBot /start
Visit https://api.telegram.org/bot<YourBOTToken>/getUpdates
Look for the channel chat ID (it should start with "-")
note
If you don't see the chat ID, try removing and re-adding the bot to the group.

The Telegram bot is now ready.

Integrating Telegram API to HyperIndex Event Handler
Create a folder libs inside src folder in the project directory, create a file inside it telegram.ts and add the following code

telegram.ts
src > libs
import axios from "axios";
import { CHAT_ID, BOT_TOKEN } from "../constants";

export const sendMessageToTelegram = async (message: string): Promise<void> => {
  try {
    const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    await axios.post(apiUrl, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("Error sending message:", error);
  }
};

You will come across some errors, let's fix them.

Install axios package

pnpm i axios

Create a file in src folder called constants.ts and add the following code:

constants.ts
src
export const EXPLORER_URL_MONAD = "https://testnet.monadvision.com/";

// Threshold for WMON transfer amount above which the bot sends a notification
export const THRESHOLD_WEI: string = process.env.ENVIO_THRESHOLD_WEI ?? "1000000000000000000"; // in wei

export const BOT_TOKEN = process.env.ENVIO_BOT_TOKEN; // Telegram bot token
export const CHAT_ID = process.env.ENVIO_TELEGRAM_CHAT_ID; // WMON Transfers Notification Channel ID

// Function to get explorer url for the provided address
export const explorerUrlAddress = (address: string) =>
  EXPLORER_URL_MONAD + "address/" + address;

// Function to get explorer url for the provided transaction hash
export const explorerUrlTx = (txHash: string) =>
  EXPLORER_URL_MONAD + "tx/" + txHash;

We can now edit the EventHandlers.ts in src folder, to add the code for sending the telegram message:

EventHandlers.ts
src
import {
  WrappedMonad,
} from "generated";
import { isIndexingAtHead, weiToEth } from "./libs/helpers";
import { sendMessageToTelegram } from "./libs/telegram";
import { THRESHOLD_WEI, explorerUrlAddress, explorerUrlTx } from "./constants";

// Other event handlers can be removed...

WrappedMonad.Transfer.handler(async ({ event, context }) => {
    const from_address = event.params.src;
    const to_address = event.params.dst;

  if (isIndexingAtHead(event.block.timestamp) && event.params.wad >= BigInt(THRESHOLD_WEI)) {
    // Only send a message when the indexer is indexing event from the time it was started and not historical transfers, and only message if the transfer amount is greater than or equal to THRESHOLD_WEI.

    // Example message
    // WMON Transfer ALERT: A new transfer has been made by 0x65C3564f1DD63eA81C11D8FE9a93F8FFb5615233 to 0xBA5Cf1c0c1238F60832618Ec49FC81e8C7C0CF01 for 2.0000 WMON! 🔥 - View on Explorer

    const msg = `WMON Transfer ALERT: A new transfer has been made by <a href="${explorerUrlAddress(from_address)}">${from_address}</a> to <a href="${explorerUrlAddress(to_address)}">${to_address}</a> for ${weiToEth(event.params.wad)} WMON! 🔥 - <a href="${explorerUrlTx(
      event.transaction.hash
    )}">View on Explorer</a>`;

    await sendMessageToTelegram(msg);
  }
});

Let us now fix the import error.

Create a file called helpers.ts in src/libs folder, paste the following code in it:

helpers.ts
src > libs
// Used to ensure notifications are only sent while indexing at the head and not historical sync
const INDEXER_START_TIMESTAMP = Math.floor(new Date().getTime() / 1000);

export const isIndexingAtHead = (timestamp: number): boolean => {
    return timestamp >= INDEXER_START_TIMESTAMP;
}

// Convert wei to ether for human readability
export const weiToEth = (bigIntNumber: bigint): string => {
  // Convert BigInt to string
  const numberString = bigIntNumber.toString();

  const decimalPointsInEth = 18;

  // Extract integer part and decimal part
  const integerPart = numberString.substring(
    0,
    numberString.length - decimalPointsInEth
  );

  const decimalPart = numberString.slice(-decimalPointsInEth);

  // Insert decimal point
  const decimalString =
    (integerPart ? integerPart : "0") +
    "." +
    decimalPart.padStart(decimalPointsInEth, "0");

  // Add negative sign if necessary
  return decimalString.slice(0, -14);
};

That's it! We can now run the indexer, and the telegram bot will start sending messages in the telegram channel when the indexer detects a WMON transfer!

example bot messageNote: Screenshot was taken before message format was changed. The message will be slightly different if you followed the guide.

note
You may not immediately start seeing messages because the indexer take some time to catch up to the tip of the the recent blocks.

The bot will only send notifications for transfers when the indexer detects a WMON transfer in finalized blocks, with timestamp greater than or equal to the indexer start time.