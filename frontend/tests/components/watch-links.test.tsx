import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import WatchLinks from "@/components/entities/watch-links";
import type { WatchLink } from "@/lib/types";

const link = (over: Partial<WatchLink> = {}): WatchLink => ({
  id: "id-1",
  provider: "filimo",
  provider_name: "فیلیمو",
  access_type: "subscription",
  access_label: "اشتراکی",
  is_affiliate: false,
  ...over,
});

describe("WatchLinks", () => {
  it("renders nothing without links", () => {
    const { container } = render(<WatchLinks links={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one button per service, routed through the counted redirect and opened safely", () => {
    render(<WatchLinks links={[link(), link({ id: "id-2", provider: "namava", provider_name: "نماوا", access_label: "رایگان" })]} />);
    const filimo = screen.getByRole("link", { name: /فیلیمو/ });
    expect(filimo).toHaveAttribute("href", expect.stringMatching(/\/watch-links\/id-1\/go$/));
    expect(filimo).toHaveAttribute("target", "_blank");
    expect(filimo.getAttribute("rel")).toContain("noopener");
    expect(filimo.getAttribute("rel")).not.toContain("sponsored");
    expect(screen.getByRole("link", { name: /نماوا/ })).toHaveTextContent("رایگان");
  });

  it("marks affiliate links as sponsored for search engines, without any note on the page", () => {
    render(<WatchLinks links={[link({ is_affiliate: true })]} />);
    expect(screen.getByRole("link", { name: /فیلیمو/ }).getAttribute("rel")).toContain("sponsored");
    expect(screen.queryByText(/همکاری تبلیغاتی/)).not.toBeInTheDocument();
  });
});
