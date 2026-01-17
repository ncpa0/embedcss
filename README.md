# embedcss

Write css in js and compile it out into a separate file.

## Setup

### Esbuild

Add the embedcss plugin to the esbuild config:

```ts
import { EmbedCssPlugin } from "embedcss/plugins/esbuild";
import { build } from "esbuild";

build({
  plugins: [
    EmbedCssPlugin({
      outname: "styles-[hash]",
      uniqueClasses: true,
      outdir: path.resolve("dist"),
    })
  ]
})
```

### Vite

Add the embedcss plugin to the vite config:

```ts
import { defineConfig } from "vite";
import { EmbedCssVitePlugin } from "embedcss/plugins/vite";

export default defineConfig({
  plugins: [
    EmbedCssVitePlugin({
      outname: "styles-[hash]",
      uniqueClasses: true,
    })
  ],
});
```

## Usage

CSS in JS can be used like this:

```tsx
import { css } from "embedcss";

const styles = css`
  .mybutton {
      border-radius: 6px;
      background: blue;
  }
`

function Button() {
  return <button className={styles.cname}>Click me</button>
}
```
