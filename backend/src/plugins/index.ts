import { connectAiPlugin } from "./embedded/connectAi";
import type { BackendEmbeddedPluginContext } from "./types";

export const registerEmbeddedPlugins = (context: BackendEmbeddedPluginContext): void => {
  for (const plugin of [connectAiPlugin]) plugin.register(context);
};
