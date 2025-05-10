declare type VarsOptions = {
  /** A css selector for the ancestor element. */
  within?: string | StyleClass;
  /** A css selector. */
  and?: string;
};

declare class StyleClass<Variables extends string = string> {
  classList: string[];
  cname: string;
  constructor(classNames: string);
  toString(): string;
  [Symbol.toPrimitive](): string;
  [Symbol.toStringTag](): string;
  /**
   * Generate CSS variables that can be used to apply changes to the stylesheet.
   *
   * @example
   * const style = css`.myelem { color: var(--font-color, black); }`;
   *
   * const elem = document.createElement('div');
   * elem.className = style.cname;
   *
   * // make font color blue:
   * style.vars({ fontColor: 'blue' }).apply(elem);
   * // or
   * elem.style.cssText = style.vars({ fontColor: 'blue' }).asStyle();
   * // or, apply it globally:
   * style.vars({ fontColor: 'blue' }).apply();
   */
  vars(
    variables: Record<Variables, string>,
    options?: VarsOptions,
  ): {
    /**
     * Returns the CSS variables as a CSS Stylesheet rule. Can be added to a <style> tag without
     * any additional string manipulations needed.
     *
     * @param within - A class name or a Style created with `css` tag template.
     *                 When provided the generated CSS will only apply to elements that are
     *                 descendants of the given class.
     */
    asCss(within?: string | StyleClass): string;
    /**
     * Return the CSS variables without the CSS selectors.
     */
    asStyle(): string;
    /**
     * Applies the css variables to the specified HTMLElement, or if no element is specified to
     * all elements with the document.
     *
     * When applying to a specific HTMLElement all the previously specified CSS selectors
     * are ignored.
     */
    apply(on?: HTMLElement): void;
    /**
     * Remove the css variables if previously applied to the given HTMLElement, or if not element is
     * specified, remove them from the global styles.
     */
    remove(on?: HTMLElement): void;
  };
}

export { StyleClass };
export declare const css: <V extends string = string>(strings: TemplateStringsArray, ...args: any[]) => StyleClass<V>;
