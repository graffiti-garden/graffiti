# Graffiti Modal

A styling modal for user input within Graffiti implementations. Used for
login popups and choosing servers. For example, see the
[Solid session manager](https://github.com/graffiti-garden/solid-oidc-session-manager/)

## Usage

Install the package with:

```
npm install @graffiti-garden/modal
```

Then use it in your application as follows:

```typescript
import { GraffitiModal } from "@graffiti-garden/modal";

const modal = new GraffitiModal({
  useTemplateHTML: import("./templates.html").then((module) => module.default),
  onClose() {
    console.log("Modal closed");
  },
});

button.addEventListener("click", () => {
  modal.displayTemplate("my-template"); // The id of a template in the HTML
  modal.open();
});
```

See the [demo](./demo/index.html) for a full example.

## Development

Clone the repository, then install and build the package as follows:

```bash
npm install
npm run build
```

Then you can run the [demo](./demo/index.html) by running:

```bash
npx http-server
```

and navigating to [localhost:8080/demo](http://localhost:8080/demo).

### Image Compression

To make the `.jpg` image smaller, use:

```
cwebp -q QUALITY -m 6 -mt graffiti.jpg -o graffiti.webp
```

Where quality is a number between 0 (horrible) and 100 (perfect).
