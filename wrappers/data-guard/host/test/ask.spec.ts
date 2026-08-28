import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../src/core/db.js";

const { clear, setVisible, show } = vi.hoisted(() => ({
  clear: vi.fn(),
  setVisible: vi.fn(),
  show: vi.fn(),
}));

vi.mock("../src/bootstrap/protocol.js", () => ({ setVisible }));
vi.mock("../src/ui/show.js", () => ({ clear, show }));

import { ask } from "../src/ui/ask.js";

const request = {
  id: "request",
  source: { key: "source", origin: "https://example.com", path: [] },
  actor: "actor",
  method: "logout",
  subject: { kind: "logout" },
  createdAt: 0,
} satisfies Request;

beforeEach(() => vi.clearAllMocks());

describe("permission prompt", () => {
  it("shows and resolves a permission prompt", async () => {
    let resolve: (answer: unknown) => void = () => {};
    show.mockImplementation((_component, props) => (resolve = props.resolve));

    const answer = ask(request, true);
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce());
    resolve({ remember: false });

    await expect(answer).resolves.toEqual({ remember: false });
    expect(clear).toHaveBeenCalledOnce();
    expect(setVisible.mock.calls).toEqual([[true], [false]]);
  });
});
