# Graffiti Modal

A styling modal for user input within Graffiti implementations. Used for
login popups and choosing servers. For example, see the
[decentralized implementation](../../implementations/decentralized/).

## Usage

Install the package with:

```
npm install @graffiti-garden/modal
```

Then use it in your application as follows:

```typescript
import { GraffitiModal } from "@graffiti-garden/modal";

const modal = new GraffitiModal({
  useTemplateHTML: () => import("./templates.html").then((m) => m.default),
  onManualClose: () => console.log("Modal closed"),
});

await modal.displayTemplate("my-template");
await modal.open();
```

Templates must be `<template>` elements with IDs.
Styles and assets are kept in
a closed shadow root.

## Development

```sh
npm run check --workspace=@graffiti-garden/modal
npm run build --workspace=@graffiti-garden/modal
npx http-server wrappers/utils/modal
```

Open `/demo/` on the local server after building.

### Image Compression

To make the `.jpg` image smaller, use:

```
cwebp -q QUALITY -m 6 -mt assets/graffiti.jpg -o src/graffiti.webp
```

Where quality is a number between 0 (horrible) and 100 (perfect).
