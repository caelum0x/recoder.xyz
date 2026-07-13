export * as PtyTicket from "./pty-ticket.js"

import { Schema } from "effect4"
import { PositiveInt } from "./schema.js"

export const ConnectToken = Schema.Struct({
  ticket: Schema.String,
  expires_in: PositiveInt,
}).annotate({ identifier: "PtyTicket.ConnectToken" })
export interface ConnectToken extends Schema.Schema.Type<typeof ConnectToken> {}
