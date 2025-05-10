export function css() {}

class StyleClass {
  /**
   * @type {string[]} classNames
   */
  classList = [];

  cname = "";

  /**
   * @param {string} classNames
   */
  constructor(classNames) {
    this.classList = classNames.split(" ").map((s) => s.trim());
    this.cname = this.classList.join(" ");
    Object.freeze(this);
    Object.freeze(this.classList);
  }

  /**
   * @param {string | StyleClass} value
   */
  toSelector(value) {
    if (typeof value === "string") {
      value = value;
    } else {
      value = value.classList.join(".");
    }

    if (value.startsWith(".") || value.startsWith("#")) {
      return value;
    }

    return `.${value}`;
  }

  /**
   * @param {Record<string, string>} variables
   * @param {{ within?: string | StyleClass, and?: string; } | undefined} options
   */
  vars(variables, options) {
    let selector = `.${this.classList.join(".")}`;

    if (options?.and) {
      selector += this.toSelector(options.and);
    }

    if (options?.within) {
      selector = `${this.toSelector(options.within)} ${selector}`;
    }

    let css = [`${selector} {`];
    for (const [name, value] of Object.entries(variables).sort(([nameA], [nameB]) => nameA.localeCompare(nameB))) {
      const cssVarName = `  --${name.replace(/(a-z)(A-Z)/, "$1-$2").toLowerCase()}`;
      css.push(`${cssVarName}: ${value};`);
    }
    css.push("}");

    /** @type {undefined | HTMLStyleElement} */
    let globalElem;

    const sc = this;
    return {
      /**
       * @param {string | StyleClass | undefined} within
       */
      asCss(within) {
        const stylesheet = css.join("\n");
        if (within) {
          return `${sc.toSelector(within)} ${stylesheet}`;
        }
        return stylesheet;
      },
      asStyle() {
        return css.slice(1, -1).join(" ");
      },
      /**
       * @param {HTMLElement | undefined} on
       */
      apply(on) {
        if (on) {
          const style = css.slice(1, -1).join(" ");
          if (on.style.cssText.length > 0 && on.style.cssText.at(-1) != ";") {
            on.style.cssText += ";" + style;
          } else {
            on.style.cssText += style;
          }
        } else {
          if (!globalElem) {
            globalElem = document.createElement("style");
            globalElem.innerText = css.join("\n");
          }
          document.head.append(globalElem);
        }
      },
      /**
       * @param {HTMLElement | undefined} from
       */
      remove(from) {
        if (from) {
          const style = css.slice(1, -1).join(" ");
          from.style.cssText = from.style.cssText.replace(style, "");
        } else if (globalElem) {
          globalElem.remove();
        }
      },
    };
  }

  toString() {
    return this.cname;
  }

  [Symbol.toPrimitive]() {
    return this.cname;
  }

  [Symbol.toStringTag]() {
    return this.cname;
  }
}

/** @param {string} className */
css.$ = function (className) {
  return new StyleClass(className);
};
