---
name: styles-bem
description: BEM conventions for this repo's SCSS and the className markup that goes with it. Use whenever creating or editing any .scss file in client/src, or changing className attributes in a .tsx component, even for a "small style tweak", spacing fix, or mobile/responsive adjustment.
---

Every component that gets its styles touched ends up with its own BEM block. Older components still use generic global classes (`.modal-overlay`, `.form-group`, `.suggestions-list`...) that leak between components; migrate the one you are touching instead of adding more rules to them.

## Naming
- Block: kebab-case name of the component, e.g. `.expense-modal` for `AddExpenseModal`. The block class goes on the component's root element.
- Element: `block__element` (`.expense-modal__input`). Never chain elements (`__body__field`); every element hangs off the block.
- Modifier: `block__element--modifier` or `block--modifier` (`.expense-modal__button--primary`). Use it alongside the base class in the markup: `className="expense-modal__button expense-modal__button--primary"`.
- State that comes from props/state is a modifier too, built in the className (`` `fab ${isOpen ? 'fab--open' : ''}` ``).

## SCSS
- One block per `.scss` file, written as a single root rule with `&__element` / `&--modifier` nesting. Keep selectors flat: one class per selector, no tag selectors (`input`, `label`) and no descendant chains.
- The one allowed exception: matching the look of a child component that has no BEM API of its own (e.g. `MultiSelect`), via a modifier-scoped descendant like `&__field--payers .multi-select-container input`, with a comment saying why.
- Prefix `@keyframes` with the block name (`expense-modal-fade-in`) so they don't collide with other files.
- Use the shared tokens from `abstracts/variables` and mixins (`respond-below(md)` etc.) as in the existing files.

## Migrating legacy classes
- Check who else uses a class before renaming it: `grep -rn "class-name" client/src cypress`.
- If other components still depend on global rules that live in the file you are migrating, move those rules unchanged into a `styles/components/_legacy-*.scss` partial and `@use` it from the same place, so the CSS they get doesn't change. `_legacy-modal.scss` is the example.
- Delete dead rules (classes no markup uses) as you go.

## Mobile
The main target is an iPhone in Safari (about 428x746 CSS px of usable viewport). Never take the text of an `input`, `select` or `textarea` below `font-size: 1rem` (16px), even when making a form more compact: iOS zooms in when they get focus and the layout breaks. Compact with padding, height, gaps and label size instead, and check the computed font-size of every focusable control (including ones inside child components like `MultiSelect`). Use `dvh` with a `vh` fallback, and add `env(safe-area-inset-*)` to padding at screen edges. After visual changes, check the result in the browser at that size.
