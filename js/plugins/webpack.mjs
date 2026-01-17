import { startService } from "../binding/index.mjs";

export class EmbedCssWebpackPlugin {
  options;
  compilerService;
  /** @type {Set<string>} */
  styles = new Set();

  constructor(options = {}) {
    this.options = options;
    this.compilerService = startService();
  }

  apply(compiler) {
    const pluginName = "EmbedCssWebpackPlugin";

    // Inject the service and styles set into the loader context
    compiler.hooks.compilation.tap(pluginName, (compilation) => {
      compilation.hooks.normalModuleLoader.tap(pluginName, (loaderContext) => {
        loaderContext.embedCssCompiler = this.compilerService;
        loaderContext.embedCssOptions = this.options;
        loaderContext.addStyle = (style) => this.styles.add(style);
      });
    });

    compiler.hooks.emit.tapAsync(pluginName, (compilation, callback) => {
      const stylesheet = Array.from(this.styles).join("\n").trim();

      if (stylesheet && this.options.onStylesheet) {
        this.options.onStylesheet(stylesheet);
      }

      if (stylesheet && this.options.write !== false) {
        const outName = this.options.outname ?? "styles";

        const outpath = `${outName}.css`;

        if (outpath.includes("[hash]")) {
          const hasher = crypto.createHash("whirlpool");
          hasher.update(stylesheet);
          const hash = hasher.digest("hex");
          outpath = outpath.replaceAll("[hash]", hash);
        }

        compilation.assets[outpath] = {
          source: () => stylesheet,
          size: () => stylesheet.length,
        };
      }

      callback();
    });

    compiler.hooks.done.tap(pluginName, () => {
      this.compilerService.close();
    });
  }
}

export default function EmbedCssWebpackLoader(source) {
  if (this.resourcePath.includes("node_modules")) {
    return source;
  }

  const compiler = this.embedCssCompiler;
  const options = this.embedCssOptions;

  const compiled = compiler.compile(source, {
    UniqueClassNames: options.uniqueClasses ?? true,
  });

  if ("Error" in compiled) {
    throw new Error(compiled.Msg);
  }

  if (compiled.Styles.length > 0) {
    this.addStyle(compiled.Styles);
  }

  return compiled.Code;
}
