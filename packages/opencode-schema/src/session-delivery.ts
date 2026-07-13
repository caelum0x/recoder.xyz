export * as SessionDelivery from "./session-delivery.js"

import { Schema } from "effect4"

export const Delivery = Schema.Literals(["steer", "queue"])
export type Delivery = typeof Delivery.Type
