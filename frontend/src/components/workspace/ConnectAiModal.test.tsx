import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectAiModal } from "./ConnectAiModal";
import * as api from "../../api";

vi.mock("../../api", () => ({
  API_URL: "/api",
  API_KEY_SCOPES: ["drawings:read", "drawings:write", "collections:read", "collections:write"],
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  isAxiosError: vi.fn(() => false),
}));

const generatedKey = {
  id: "key-1",
  name: "AI connection",
  prefix: "exd_abcdefgh1234",
  scopes: ["drawings:read", "drawings:write", "collections:read", "collections:write"],
  lastUsedAt: null,
  revokedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("ConnectAiModal", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.mocked(api.listApiKeys).mockResolvedValue([]);
    vi.mocked(api.createApiKey).mockResolvedValue({ apiKey: generatedKey, token: "exd_secret-token" });
    vi.mocked(api.revokeApiKey).mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  });

  it("derives the MCP URL and embeds the one-time key in Codex and Claude setup", async () => {
    render(<ConnectAiModal open onClose={vi.fn()} />);
    expect(screen.getByLabelText(/mcp server url/i)).toHaveValue("http://localhost:3000/api/mcp");

    fireEvent.click(screen.getByRole("button", { name: /generate connection key/i }));
    expect(await screen.findByText(/mcp_servers\.excalidash/)).toBeInTheDocument();
    expect(screen.getByText(/Bearer exd_secret-token/)).toBeInTheDocument();
    expect(api.createApiKey).toHaveBeenCalledWith("AI connection", [...api.API_KEY_SCOPES]);

    fireEvent.click(screen.getByRole("tab", { name: "Claude Code" }));
    expect(screen.getByText(/claude mcp add/)).toHaveTextContent("Authorization: Bearer exd_secret-token");
    fireEvent.click(screen.getByRole("button", { name: /copy mcp setup/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("exd_secret-token")));
  });

  it("lists and revokes existing API keys", async () => {
    vi.mocked(api.listApiKeys).mockResolvedValue([generatedKey]);
    render(<ConnectAiModal open onClose={vi.fn()} />);
    expect(await screen.findByText("AI connection")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /revoke api key ai connection/i }));
    await waitFor(() => expect(api.revokeApiKey).toHaveBeenCalledWith("key-1"));
    expect(await screen.findByText(/revoked/i)).toBeInTheDocument();
  });

  it("does not hide a new token when revoking a different key with the same name", async () => {
    vi.mocked(api.listApiKeys).mockResolvedValue([{ ...generatedKey, id: "older-key" }]);
    render(<ConnectAiModal open onClose={vi.fn()} />);
    await screen.findByText("AI connection");
    fireEvent.click(screen.getByRole("button", { name: /generate connection key/i }));
    expect(await screen.findByText(/Bearer exd_secret-token/)).toBeInTheDocument();

    const revokeButtons = screen.getAllByRole("button", { name: /revoke api key ai connection/i });
    fireEvent.click(revokeButtons[1]);

    await waitFor(() => expect(api.revokeApiKey).toHaveBeenCalledWith("older-key"));
    expect(screen.getByText(/Bearer exd_secret-token/)).toBeInTheDocument();
  });
});
