export class McpWorkspaceError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "INVALID" | "UNAVAILABLE" = "INVALID",
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
