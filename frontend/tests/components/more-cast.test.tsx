import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MoreCast from "@/components/entities/more-cast";

const cast = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Actor ${i + 1}`, character: `Role ${i + 1}`, image_url: null }));

describe("MoreCast", () => {
  it("renders nothing without extra cast", () => {
    const { container } = render(<MoreCast cast={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the first twelve and expands to all on demand", async () => {
    const user = userEvent.setup();
    render(<MoreCast cast={cast(20)} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(12);

    await user.click(screen.getByRole("button", { name: /نمایش همه/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(20);

    await user.click(screen.getByRole("button", { name: "نمایش کمتر" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });

  it("has no toggle when everything already fits", () => {
    render(<MoreCast cast={cast(5)} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows name and character, with an initial standing in for a missing photo", () => {
    render(<MoreCast cast={[{ name: "Morgan Freeman", character: "Red", image_url: null }]} />);
    expect(screen.getByText("Morgan Freeman")).toBeInTheDocument();
    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
  });
});
