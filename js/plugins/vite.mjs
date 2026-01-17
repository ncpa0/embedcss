import crypto from "crypto";
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
 * @param {EmbedCssPluginOptions} options
 * @returns {import('vite').Plugin}
 */
export function EmbedCssVitePlugin(options = {}) {
  let compiler = startService();
  /** @type {Set<string>} */
  const compiledStyles = new Set();
  let cssBundleLink = "";

  /** @type {Map<string, {stylesheet: string;file: string}>} */
  const compiledCssVirtualModules = new Map();
  /** @type {Map<string, string>} */
  const fileToModule = new Map();

  /** @type {import("vite").ViteDevServer} */
  let devServer;

  return {
    name: "embed-css-vite-plugin",
    enforce: "pre",

    configureServer(_server) {
      devServer = _server;
    },

    resolveId(id) {
      if (compiledCssVirtualModules.has(id)) {
        return id;
      }
    },

    load(id) {
      const module = compiledCssVirtualModules.get(id);
      if (module) {
        // In dev, Vite wraps this in its own CSS HMR logic automatically
        return module.stylesheet;
      }
    },

    async transform(code, id) {
      if (id.includes("/node_modules/") || !/\.(j|t)sx?$/.test(id)) {
        return null;
      }

      if (compiler.isClosed()) {
        compiler = startService();
      }

      const compiled = await compiler.compile(code, {
        UniqueClassNames: options.uniqueClasses ?? true,
      });

      if ("Error" in compiled) {
        this.error(compiled.Msg);
      }

      if (compiled.Styles.length > 0) {
        compiledStyles.add(compiled.Styles);
      }

      if (devServer && compiled.Styles.length > 0) {
        // invalidate the previous version if exists
        const prevModule = fileToModule.get(id);
        if (prevModule) {
          const viteMod = devServer.moduleGraph.getModuleById(prevModule);
          if (viteMod) {
            devServer.moduleGraph.invalidateModule(viteMod);
          }
          compiledCssVirtualModules.delete(prevModule);
        }

        const hasher = crypto.createHash("sha256");
        hasher.update(compiled.Styles);
        const hash = hasher.digest("hex").slice(0, 8);
        const moduleID = `virtual:${hash}.css`;
        compiledCssVirtualModules.set(moduleID, { stylesheet: compiled.Styles, file: id });
        fileToModule.set(id, moduleID);
        compiled.Code = `import "${moduleID}";\n${compiled.Code}`;
      }

      return {
        code: compiled.Code,
        map: null,
      };
    },

    async generateBundle(opts, bundle, isWrite) {
      const stylesheet = Array.from(compiledStyles).join("\n").trim();
      if (!stylesheet) return;

      if (options.onStylesheet) {
        options.onStylesheet(stylesheet);
      }

      if (options.write !== false && isWrite) {
        const outName = options.outname ?? "styles-[hash]";
        let outpath = `assets/${outName}.css`;

        if (this.meta.watchMode === false && outpath.includes("[hash]")) {
          const hasher = crypto.createHash("sha256");
          hasher.update(stylesheet);
          const hash = hasher.digest("hex").slice(0, 8);
          outpath = outpath.replaceAll("[hash]", hash);
        }

        this.emitFile({
          type: "asset",
          fileName: outpath,
          source: stylesheet,
        });
        cssBundleLink = outpath;
      }

      compiler.close();
    },

    transformIndexHtml(html) {
      if (options.write === false) return html;

      return {
        html,
        tags: [
          {
            tag: "link",
            attrs: { rel: "stylesheet", "href": `/${cssBundleLink}` },
            injectTo: "head",
          },
        ],
      };
    },
  };
}
