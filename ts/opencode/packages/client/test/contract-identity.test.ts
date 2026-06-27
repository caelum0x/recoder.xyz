import { expect, test } from "bun:test"
import { Schema } from "effect"
import { AgentV2 } from "@recoder/opencode-core/agent"
import { Location as CoreLocation } from "@recoder/opencode-core/location"
import { ModelV2 } from "@recoder/opencode-core/model"
import { SessionV2 } from "@recoder/opencode-core/session"
import { SessionInput as CoreSessionInput } from "@recoder/opencode-core/session/input"
import { SessionMessage as CoreSessionMessage } from "@recoder/opencode-core/session/message"
import { Prompt as CorePrompt } from "@recoder/opencode-core/session/prompt"
import { Agent } from "@recoder/opencode-schema/agent"
import { Location } from "@recoder/opencode-schema/location"
import { Model } from "@recoder/opencode-schema/model"
import { Project } from "@recoder/opencode-schema/project"
import { Provider } from "@recoder/opencode-schema/provider"
import { Prompt } from "@recoder/opencode-schema/prompt"
import { Session } from "@recoder/opencode-schema/session"
import { SessionInput } from "@recoder/opencode-schema/session-input"
import { SessionMessage } from "@recoder/opencode-schema/session-message"
import { Workspace } from "@recoder/opencode-schema/workspace"
import { Api } from "@recoder/opencode-server/api"
import { compile, emitPromise } from "@recoder/opencode-httpapi-codegen"
import { HttpApi } from "effect/unstable/httpapi"
import { SessionGroup } from "../src/contract"

test("Core and Server reuse the authoritative Schema and Protocol values", () => {
  expect(AgentV2.ID).toBe(Agent.ID)
  expect(CoreLocation.Ref).toBe(Location.Ref)
  expect(ModelV2.Ref).toBe(Model.Ref)
  expect(SessionV2.Info).toBe(Session.Info)
  expect(CoreSessionInput.Admitted).toBe(SessionInput.Admitted)
  expect(CoreSessionMessage.Message).toBe(SessionMessage.Message)
  expect(CorePrompt).toBe(Prompt)
  expect(Api.groups["server.session"].identifier).toBe("server.session")
  expect(SessionGroup.identifier).toBe(Api.groups["server.session"].identifier)
  expect(Session.ID.create()).toStartWith("ses_")
  expect(Project.ID.global).toBe("global")
  expect(Provider.ID.anthropic).toBe("anthropic")
  expect(Workspace.ID.create()).toStartWith("wrk_")
})

test("client and Server Session contracts generate identically", () => {
  const options = { groupNames: { "server.session": "sessions" } }
  const server = compile(HttpApi.make("server").add(Api.groups["server.session"]), options)
  const client = compile(HttpApi.make("client").add(SessionGroup), options)

  expect(emitPromise(client)).toEqual(emitPromise(server))
})

test("shared DTO schemas construct and decode plain objects", () => {
  const made = Prompt.make({ text: "hello" })
  const decoded = Schema.decodeUnknownSync(Prompt)({ text: "hello" })
  const content = Schema.decodeUnknownSync(SessionMessage.AssistantText)({ type: "text", id: "part_1", text: "hi" })

  expect(Object.getPrototypeOf(made)).toBe(Object.prototype)
  expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype)
  expect(Object.getPrototypeOf(content)).toBe(Object.prototype)
  expect(Prompt.ast.annotations?.identifier).toBe("Prompt")
  expect(SessionMessage.AssistantText.ast.annotations?.identifier).toBe("Session.Message.Assistant.Text")
  expect(CoreSessionMessage.AssistantText).toBe(SessionMessage.AssistantText)
})
