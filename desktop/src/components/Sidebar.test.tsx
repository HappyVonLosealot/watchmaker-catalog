// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncProgress } from "../types";
import { Sidebar } from "./Sidebar";

const sync: SyncProgress = {
  state: "complete",
  label: "Catalogue is current",
  completed: 1,
  total: 1,
  lastSuccessfulSync: null,
};

afterEach(cleanup);

describe("primary navigation", () => {
  it("opens both recommendation tools as their own destinations", () => {
    const onViewChange = vi.fn();
    render(
      <Sidebar
        currentView="discover"
        onViewChange={onViewChange}
        sync={sync}
        onSync={() => undefined}
        canSync
        catalogCount={100}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "What's The Vibe?" }));
    fireEvent.click(screen.getByRole("button", { name: "Tell Me Whatcu' Want" }));

    expect(onViewChange).toHaveBeenCalledWith("vibe");
    expect(onViewChange).toHaveBeenCalledWith("prompt");
  });
});
