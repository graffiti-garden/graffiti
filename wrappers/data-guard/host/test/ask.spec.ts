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

describe("permission prompt queue", () => {
  it("does not replace an unresolved prompt with a concurrent request", async () => {
    const resolve: ((answer: unknown) => void)[] = [];
    show.mockImplementation((_component, props) => resolve.push(props.resolve));

    const first = ask(request, true);
    const second = ask({ ...request, id: "second" }, true);
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(1));

    resolve.shift()?.({ remember: false });
    await first;
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(2));

    resolve.shift()?.(false);
    await second;
    expect(clear).toHaveBeenCalledTimes(2);
    expect(setVisible.mock.calls.map(([visible]) => visible)).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});
