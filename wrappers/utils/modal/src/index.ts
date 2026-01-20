export class GraffitiModal {
  protected dialog = document.createElement("dialog");
  protected shadow: ShadowRoot;
  protected main_: Promise<HTMLElement> | undefined;
  protected useTemplateHTML: () => Promise<string> | string;
  protected templates_: Promise<Map<string, HTMLTemplateElement>> | undefined;
  protected onManualClose?: () => any;

  constructor(options: {
    useTemplateHTML: () => Promise<string> | string;
    onManualClose?: () => any;
  }) {
    this.useTemplateHTML = options.useTemplateHTML;
    this.onManualClose = options.onManualClose;

    this.dialog.className = "graffiti-modal";

    // Click outside of dialog to close
    this.dialog.addEventListener("click", (e) => {
      if ("pointerType" in e && !e.pointerType) return;
      const rect = this.dialog.getBoundingClientRect();
      if (
        rect.top > e.clientY ||
        rect.left > e.clientX ||
        e.clientY > rect.top + rect.height ||
        e.clientX > rect.left + rect.width
      ) {
        this.close();
        this.onManualClose?.();
      }
    });

    const host = document.createElement("div");
    this.shadow = host.attachShadow({ mode: "closed" });
    this.shadow.appendChild(this.dialog);
    document.body.append(host);
  }

  protected get templates() {
    if (!this.templates_) {
      this.main_; // Start loading main, too
      this.templates_ = new Promise<string>(async (r) =>
        r(await this.useTemplateHTML()),
      ).then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const templates = new Map<string, HTMLTemplateElement>();
        doc.querySelectorAll("template").forEach((template) => {
          const id = template.id;
          if (!id) return;
          templates.set(id, template);
        });
        return templates;
      });
    }
    return this.templates_;
  }

  protected get main() {
    if (!this.main_) {
      this.templates_; // Start loading templates, too
      this.main_ = Promise.all([
        import("./style.css"),
        import("./graffiti.webp"),
        import("./rock-salt.woff2"),
      ]).then(
        async ([{ default: style }, { default: image }, { default: font }]) => {
          const header = document.createElement("header");
          const closeButton = document.createElement("button");
          closeButton.className = "secondary";
          closeButton.textContent = "Close";
          closeButton?.addEventListener("click", () => {
            this.close();
            this.onManualClose?.();
          });
          header.appendChild(closeButton);

          const main = document.createElement("main");

          this.dialog.appendChild(header);
          this.dialog.appendChild(main);

          const ff = new FontFace("Rock Salt", `url(${font})`, {
            style: "normal",
            weight: "400",
          });
          document.fonts.add(ff);
          await ff.load();

          style = style.replace("url(graffiti.jpg)", `url(${image})`);

          const sheet = new CSSStyleSheet();
          sheet.replace(style).then(() => {
            this.shadow.adoptedStyleSheets = [sheet];
          });

          return main;
        },
      );
    }
    return this.main_;
  }

  async open() {
    await this.main;
    this.dialog.showModal();
    this.dialog.focus();
  }

  close() {
    this.dialog.close();
  }

  async displayTemplate(templateId: string) {
    const main = await this.main;
    main.innerHTML = "";
    const template = (await this.templates).get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    const content = template.content.cloneNode(true);
    main.appendChild(content);
    return main;
  }
}
