import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeSvgPreview } from "./SafeSvgPreview";

describe("SafeSvgPreview", () => {
  it("loads stored SVG as an inert image instead of injecting its markup", () => {
    const { container } = render(
      <SafeSvgPreview
        svg={'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'}
        alt="Drawing preview"
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("img", { name: "Drawing preview" })).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/svg\+xml/),
    );
  });
});
