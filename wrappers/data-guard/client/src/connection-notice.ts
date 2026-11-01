/** This lives outside the iframe: it must work even when the guard never loads. */
export function createConnectionNotice(hostUrl: URL): HTMLElement {
  const notice = document.createElement("div");
  // Keep the notice's styling independent of the embedding app's styles.
  const root = notice.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; position: fixed; bottom: 1rem; right: 1rem; z-index: 2147483646; width: min(24rem, calc(100vw - 2rem)); }
      section { padding: 1rem; border: 1px solid #aaa; border-radius: .5rem; background: #fff; color: #222; box-shadow: 0 .2rem 1rem #0002; font: 1rem/1.4 system-ui, sans-serif; }
      p { margin: 0; }
      p + p { margin-top: .75rem; }
      a { color: #185abc; overflow-wrap: anywhere; }
    </style>
    <section role="status" aria-label="Connection status">
      <p>This is taking longer than expected!</p>
      <p>If it stays stuck, open <a target="_blank" rel="noopener noreferrer"></a> to check the connection, then reload.</p>
    </section>`;
  const link = root.querySelector("a")!;
  link.href = hostUrl.origin;
  link.textContent = hostUrl.host;
  return notice;
}
