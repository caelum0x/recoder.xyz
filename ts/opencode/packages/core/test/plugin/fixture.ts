import { Credential } from "@recoder/opencode-core/credential"
import { EventV2 } from "@recoder/opencode-core/event"
import { FileSystem } from "@recoder/opencode-core/filesystem"
import { FSUtil } from "@recoder/opencode-core/fs-util"
import { Global } from "@recoder/opencode-core/global"
import { Npm } from "@recoder/opencode-core/npm"
import { PluginV2 } from "@recoder/opencode-core/plugin"
import { RepositoryCache } from "@recoder/opencode-core/repository-cache"
import { Ripgrep } from "@recoder/opencode-core/ripgrep"
import { SkillDiscovery } from "@recoder/opencode-core/skill/discovery"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { tempLocationLayer } from "../fixture/location"

export const PluginTestLayer = Layer.mergeAll(FileSystem.locationLayer, PluginV2.locationLayer).pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      Credential.defaultLayer,
      EventV2.defaultLayer,
      FetchHttpClient.layer,
      FSUtil.defaultLayer,
      Global.defaultLayer,
      Layer.succeed(
        Npm.Service,
        Npm.Service.of({
          add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
          install: () => Effect.void,
          which: () => Effect.succeed(undefined),
        }),
      ),
      RepositoryCache.defaultLayer,
      SkillDiscovery.defaultLayer,
      Ripgrep.defaultLayer,
      tempLocationLayer,
    ),
  ),
)
