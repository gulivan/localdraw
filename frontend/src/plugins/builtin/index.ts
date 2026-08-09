import { connectAiPlugin } from "./connectAi";
import { imageGenerationPlugin } from "./imageGeneration";
import type { EmbeddedPlugin } from "../types";

export const embeddedPlugins: EmbeddedPlugin[] = [connectAiPlugin, imageGenerationPlugin];
