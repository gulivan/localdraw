import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceHeader } from "./WorkspaceHeader";

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: null, authEnabled: false, logout: vi.fn() }),
}));
vi.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

describe("WorkspaceHeader", () => {
  it("links the workspace attribution to Excalidraw in a new tab", () => {
    render(
      <MemoryRouter>
        <WorkspaceHeader query="" onQueryChange={vi.fn()} onNewSlide={vi.fn()} onImport={vi.fn()} />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Excalidraw" });
    expect(link).toHaveAttribute("href", "https://excalidraw.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    const githubLink = screen.getByRole("link", { name: "GitHub" });
    expect(githubLink.parentElement).toHaveTextContent(/^LocalDraw v/);
    expect(githubLink).toHaveAttribute("href", "https://github.com/gulivan/localdraw");
    expect(githubLink).toHaveAttribute("target", "_blank");
    expect(githubLink).toHaveAttribute("rel", "noopener noreferrer");
  });
});
