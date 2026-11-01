import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../src/core/db.js";
import type { GuardAnswer, GuardQueueStatus } from "../src/core/guard.js";
import { ask } from "../src/ui/ask.js";
import { clear, componentState, pendingRequests, privateResult } from "../src/ui/show.js";
import { setVisible } from "../src/bootstrap/protocol.js";

vi.mock("../src/bootstrap/protocol.js", () => ({ setVisible: vi.fn() }));

const request = {
  source: { key: "source", origin: "https://example.com", path: [] },
  actor: "actor",
  method: "logout",
  subject: { kind: "logout" },
} satisfies Request;

beforeEach(() => {
  vi.clearAllMocks();
  clear();
});

function resolve(answer: GuardAnswer) {
  (componentState.props.resolve as (answer: GuardAnswer) => void)(answer);
}

describe("permission prompt", () => {
  it("shows and resolves a permission prompt", async () => {
    const answer = ask(request, true);
    await vi.waitFor(() => expect(componentState.component).not.toBeNull());
    resolve({ allow: false, remember: true });

    await expect(answer).resolves.toEqual({ allow: false, remember: true });
    expect(componentState.component).toBeNull();
    expect(vi.mocked(setVisible).mock.calls).toEqual([[true], [false]]);
  });

  it("observes the authorization queue only while the prompt is open", async () => {
    const queue: GuardQueueStatus = { pending: 2, events: new EventTarget() };
    const answer = ask(request, true, undefined, { queue, privateResult: 3 });
    await vi.waitFor(() => expect(pendingRequests.value).toBe(2));
    expect(privateResult.value).toBe(3);

    queue.pending = 3;
    queue.events.dispatchEvent(new Event("change"));
    expect(pendingRequests.value).toBe(3);
    resolve(false);
    await answer;

    queue.pending = 4;
    queue.events.dispatchEvent(new Event("change"));
    expect(pendingRequests.value).toBe(0);
    expect(privateResult.value).toBeUndefined();
  });
});
