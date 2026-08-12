import { connectAiPlugin } from "./connectAi";
import { imageGenerationPlugin } from "./imageGeneration";
import { aiDrawingPlugin } from "./aiDrawing";
import type { EmbeddedPlugin } from "../types";

export const embeddedPlugins: EmbeddedPlugin[] = [connectAiPlugin, aiDrawingPlugin, imageGenerationPlugin];
