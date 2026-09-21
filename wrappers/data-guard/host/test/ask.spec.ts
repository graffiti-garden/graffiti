import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../src/core/db.js";
import type { GuardQueueStatus } from "../src/core/guard.js";

const { clear, pendingRequests, privateResult, setVisible, show } = vi.hoisted(() => ({
  clear: vi.fn(),
  pendingRequests: { value: 0 },
  privateResult: { value: undefined as number | undefined },
  setVisible: vi.fn(),
  show: vi.fn(),
}));

vi.mock("../src/bootstrap/protocol.js", () => ({ setVisible }));
vi.mock("../src/ui/show.js", () => ({
  clear,
  pendingRequests,
  privateResult,
  show,
}));

import { ask } from "../src/ui/ask.js";

const request = {
  id: "request",
  source: { key: "source", origin: "https://example.com", path: [] },
  actor: "actor",
  method: "logout",
  subject: { kind: "logout" },
  createdAt: 0,
} satisfies Request;

beforeEach(() => {
  vi.clearAllMocks();
  pendingRequests.value = 0;
  privateResult.value = undefined;
});

describe("permission prompt", () => {
  it("shows and resolves a permission prompt", async () => {
    let resolve: (answer: unknown) => void = () => {};
    show.mockImplementation((_component, props) => (resolve = props.resolve));

    const answer = ask(request, true);
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce());
    resolve({ allow: false, remember: true });

    await expect(answer).resolves.toEqual({ allow: false, remember: true });
    expect(clear).toHaveBeenCalledOnce();
    expect(setVisible.mock.calls).toEqual([[true], [false]]);
  });

  it("tracks the live authorization queue", () => {
    const queue: GuardQueueStatus = {
      pending: 2,
      events: new EventTarget(),
    };

    void ask(request, true, undefined, {
      queue,
      privateResult: 3,
    });
    expect(pendingRequests.value).toBe(2);
    expect(privateResult.value).toBe(3);

    queue.pending = 3;
    queue.events.dispatchEvent(new Event("change"));
    expect(pendingRequests.value).toBe(3);
  });
});
