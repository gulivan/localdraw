import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectAiModal } from "./ConnectAiModal";
import * as api from "../../api";

vi.mock("../../api", () => ({
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
    writeText.mockClear();
    vi.mocked(api.listApiKeys).mockResolvedValue([]);
    vi.mocked(api.createApiKey).mockResolvedValue({ apiKey: generatedKey, token: "exd_secret-token" });
    vi.mocked(api.revokeApiKey).mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  });

  it("derives the MCP URL and embeds the one-time key in MCP setup snippets", async () => {
    render(<ConnectAiModal open onClose={vi.fn()} />);
    expect(screen.getByLabelText(/mcp server url/i)).toHaveValue("http://localhost:3000/api/mcp");
    expect(screen.queryByLabelText(/connection path/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /generate connection key/i }));
    expect(await screen.findByText(/mcp_servers\.localdraw/)).toBeInTheDocument();
    expect(screen.getByText(/LOCALDRAW_MCP_TOKEN='exd_secret-token'/)).toBeInTheDocument();
    expect(api.createApiKey).toHaveBeenCalledWith("AI connection", [...api.API_KEY_SCOPES]);

    expect(screen.getByText(/bearer_token_env_var = "LOCALDRAW_MCP_TOKEN"/)).toBeInTheDocument();
    expect(screen.queryByText(/http_headers/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "LocalDraw CLI" }));
    expect(screen.getByText(/npx localdraw -- list-tools/)).toHaveTextContent("LOCALDRAW_MCP_TOKEN='exd_secret-token'");

    fireEvent.click(screen.getByRole("tab", { name: "Claude Code" }));
    expect(screen.getByText(/claude mcp add/)).toHaveTextContent("localdraw");
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
    expect(await screen.findByText(/LOCALDRAW_MCP_TOKEN='exd_secret-token'/)).toBeInTheDocument();

    const revokeButtons = screen.getAllByRole("button", { name: /revoke api key ai connection/i });
    fireEvent.click(revokeButtons[1]);

    await waitFor(() => expect(api.revokeApiKey).toHaveBeenCalledWith("older-key"));
    expect(screen.getByText(/LOCALDRAW_MCP_TOKEN='exd_secret-token'/)).toBeInTheDocument();
  });
});
