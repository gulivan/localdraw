import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Layout } from "./Layout";

vi.mock("./Logo", () => ({
  Logo: () => <div data-testid="logo">logo</div>,
}));

vi.mock("./UploadStatus", () => ({
  UploadStatus: () => <div data-testid="upload-status">upload-status</div>,
}));

vi.mock("./ImpersonationBanner", () => ({
  ImpersonationBanner: () => null,
}));

vi.mock("./UpdateBanner", () => ({
  UpdateBanner: () => null,
}));

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={["/collections"]}>
      <Routes>
        <Route
          path="/collections"
          element={
            <Layout>
              <div>content</div>
            </Layout>
          }
        />
        <Route path="/" element={<div>Home destination</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("Layout", () => {
  it("uses a compact brand header without the legacy sidebar", () => {
    renderLayout();

    expect(screen.getByTestId("logo")).toBeInTheDocument();
    expect(screen.getByText("LocalDraw")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("returns to Home from the product logo", async () => {
    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "LocalDraw Home" }));

    expect(await screen.findByText("Home destination")).toBeInTheDocument();
  });
});
