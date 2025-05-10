import crypto from "crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { startService } from "../binding/index.mjs";

/**
 * @import { Plugin, OnLoadArgs, OnLoadResult } from "esbuild"
 *
 * @typedef {{
 *   uniqueClasses?: boolean;
 *   outname?: string;
 *   write?: boolean;
 *   onStylesheet?: (stylesheet: string) => void
 * }} EmbedCssPluginOptions
 */

/**
 * @param {EmbedCssPluginOptions | undefined} options
 * @returns {Plugin}
 */
export function EmbedCssPlugin(options = {}) {
  let compiler = startService();
  function ensureCompilerAvailable() {
    if (compiler.isClosed()) {
      compiler = startService();
    }
  }

  return {
    name: "embed-css-esbuild-plugin",
    setup(build) {
      const outName = options.outname ?? "styles";
      let outdir = "";
      if (build.initialOptions.outdir) {
        outdir = build.initialOptions.outdir;
      } else if (build.initialOptions.outfile) {
        outdir = path.dirname(build.initialOptions.outfile);
      }

      /** @type {string[]} */
      const compiledStyles = [];

      /**
       * @param {OnLoadArgs} args
       * @param {"js" | "jsx" | "ts" | "tsx"} loader
       * @returns {Promise<OnLoadResult>}
       */
      async function loader(args, loader) {
        ensureCompilerAvailable();
        const content = await fs.readFile(args.path, "utf8");
        const compiled = await compiler.compile(content, {
          UniqueClassNames: "uniqueClasses" in options ? !!options.uniqueClasses : true,
        });
        if ("Error" in compiled) {
          return { errors: [{ text: compiled.Msg }] };
        }
        if (compiled.Styles.length > 0) {
          const esbuildResult = await build.esbuild.build({
            stdin: {
              contents: compiled.Styles,
              loader: "css",
              resolveDir: path.dirname(args.path),
              sourcefile: args.path,
            },
            write: false,
            bundle: true,
          });
          compiledStyles.push(esbuildResult.outputFiles[0].text);
        }
        return {
          contents: compiled.Code,
          loader,
        };
      }

      build.onLoad({ filter: /.+\.(js|mjs|cjs)$/ }, (args) => loader(args, "js"));
      build.onLoad({ filter: /.+\.(jsx|mjsx|cjsx)$/ }, (args) => loader(args, "jsx"));
      build.onLoad({ filter: /.+\.(ts|mts|cts)$/ }, (args) => loader(args, "ts"));
      build.onLoad({ filter: /.+\.(tsx|mtsx|ctsx)$/ }, (args) => loader(args, "tsx"));

      build.onEnd(async () => {
        const stylesheet = compiledStyles.join("\n").trim();

        if (stylesheet.length === 0) {
          return;
        }

        if (options?.onStylesheet) {
          options.onStylesheet(stylesheet);
        }

        if (options?.write !== false) {
          let hash = "";
          if (build.initialOptions?.entryNames?.includes("[hash]")) {
            const hasher = crypto.createHash("whirlpool");
            hasher.update(stylesheet);
            hash = hasher.digest("hex");
          }
          let outpath = build.initialOptions?.entryNames != null
            ? build.initialOptions.entryNames
              .replaceAll("[dir]", outdir)
              .replaceAll("[name]", outName)
              .replaceAll("[hash]", hash)
              .replaceAll("[ext]", "css")
            : `${outName}.css`;

          if (build.initialOptions?.entryNames?.includes("[dir]") || path.isAbsolute(outpath)) {
            await fs.writeFile(outpath, stylesheet, "utf-8");
          } else {
            await fs.writeFile(path.resolve(outdir, outpath), stylesheet, "utf-8");
          }
        }

        compiler.close();
        compiledStyles.splice(0, compiledStyles.length);
      });
    },
  };
}
