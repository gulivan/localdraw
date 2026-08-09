import type express from "express";
import type { RegisterMcpDeps } from "../mcp/server";

export type BackendEmbeddedPluginContext = {
  app: express.Express;
  connectAi: RegisterMcpDeps;
};

export type BackendEmbeddedPlugin = {
  id: string;
  register: (context: BackendEmbeddedPluginContext) => void;
};
