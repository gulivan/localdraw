import { registerMcpServer } from "../../mcp/server";
import type { BackendEmbeddedPlugin } from "../types";

export const connectAiPlugin: BackendEmbeddedPlugin = {
  id: "localdraw.connect-ai",
  register: ({ app, connectAi }) => registerMcpServer(app, connectAi),
};
