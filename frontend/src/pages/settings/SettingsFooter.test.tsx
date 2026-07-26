import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsFooter } from "./SettingsFooter";

describe("SettingsFooter", () => {
  it("shows version information and opens project links in new tabs", () => {
    render(<SettingsFooter appVersion="1.2.3" buildLabel="dev" />);

    expect(screen.getByText(/Version 1\.2\.3/)).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.getByLabelText("Project links")).toHaveTextContent(
      "Based on ExcaliDash and Excalidraw",
    );

    expect(screen.getByRole("link", { name: "ExcaliDash" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "Excalidraw" })).toHaveAttribute(
      "target",
      "_blank",
    );
  });
});
