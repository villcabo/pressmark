# Theme pack format

A theme pack is a folder with two required files:

```
my-theme/
├─ theme.json      identity, tokens and page geometry
├─ theme.css       styles, which consume the tokens through var(--name)
└─ fonts/          optional: bundled typefaces
```

The formal schema lives in [`../themes/theme.schema.json`](../themes/theme.schema.json).
`bun run validate` checks every pack against it.

## The rule that holds everything together

> **The palette and the page geometry live in `theme.json`. The CSS only
> consumes them.**

The renderer reads `theme.json`, emits the tokens as CSS variables on `:root`,
and only then loads `theme.css`. That is why a `theme.css` **cannot** declare
`:root` or `@page` — the validator rejects it.

Why so strict? Because the alternative was already tried and it failed: in the
old format the margin lived in the CSS *and* in a separate JSON, with different
values in all six themes and nothing to warn anyone. One source of truth is not
purism here, it is the only thing that keeps that from happening again. See
[`format-rationale.md`](format-rationale.md).

## `theme.json`

```jsonc
{
  "$schema": "../theme.schema.json",
  "id": "my-theme",              // must match the folder name
  "name": "My Theme",
  "version": "1.0.0",
  "extends": "_base",            // key-by-key inheritance; CSS is stacked

  "tokens": {                    // emitted as --accent, --ink, ...
    "accent": "#1e4d3b",
    "cover-offset": "58mm"
  },

  "page": {
    "size": "A4",                // or { "width": "...", "height": "..." }
    "margin": { "top": "24mm", "right": "19mm", "bottom": "18mm", "left": "19mm" },
    "printBackground": true
  },

  "cover": { "enabled": true, "break": "page" },

  "footer": {
    "enabled": true,
    "left":  "{{vars.confidentiality}}",
    "right": "Page {{page}} of {{pages}}",
    "rule": true
  },
  "vars": { "confidentiality": "Confidential · internal use" }
}
```

### Inheritance

`extends` merges **key by key** (shallow): `tokens`, `page`, `cover`, `header`,
`footer` and `vars`. CSS is not merged, it is **stacked**: the parent's first,
then your own. `extends: null` inherits nothing.

A pack whose `id` starts with `_` is internal: you can inherit from it, but it
is not offered to the user as a choice.

### Localized text

Anything the reader sees can be a plain string or an object keyed by language:

```jsonc
"footer": { "right": { "en": "Page {{page}} of {{pages}}",
                       "es": "Página {{page}} de {{pages}}" } }
```

It applies to `name`, `description`, `vars`, header and footer slots, and the
labels in `tokenSchema` / `varSchema`. A plain string is used for every
language, so no pack is forced to translate anything.

The fallback chain, in order: exact match, the requested base language
(`pt-BR` falls back to `pt`), any variant of that language, `en`, any variant of
`en`, and finally the first key in alphabetical order. Alphabetical order is not
arbitrary — Go maps iterate randomly, and without a stable rule the CLI and the
plugin could pick different text for the same pack.

## Cover pages by convention

There is no special markup. The cover is built from what you already write:

```markdown
# Document title                <- the first h1: the title

**System:** X · **Date:** Y     <- the paragraph (or table) that follows: metadata

---                             <- the first <hr>: closes the cover
```

`cover.enabled` turns the treatment on; `cover.break` decides whether the `<hr>`
breaks the page. The height is controlled by the `cover-offset` token, not by
CSS.

Both a paragraph and a **table** work as the metadata block. Real documents tend
to use a two-column table, and it is styled as metadata rather than as a data
table: no header band, narrow first column in the muted color.

## Header and footer

They are composed from `left` / `center` / `right` slots. The renderer generates
the HTML and **injects the side margin itself**, so it can never drift out of
sync with `page.margin`.

Placeholders: `{{page}}`, `{{pages}}`, `{{title}}`, `{{date}}`, `{{file}}`,
`{{vars.ANY}}`, and `{{fm.FIELD}}` for any field in the note's frontmatter.

## HTML structure contract

Both renderers wrap the document in:

```html
<article class="pm-doc"> ... </article>
```

and guarantee that top-level blocks (`h1`, `p`, `hr`, `table`, ...) are
**direct** children of that element. The theme CSS depends on it:
`.pm-doc > h1:first-of-type` is what builds the cover.

Without this contract the same theme pack would render differently in the
terminal and in Obsidian, which is exactly what this project exists to prevent.

## `tokenSchema`, `varSchema` and the settings UI

`themes/_base/theme.json` declares the type and label of every token:

```jsonc
"tokenSchema": {
  "accent": { "type": "color", "group": "palette", "label": "Accent" }
}
```

Types: `color`, `font-stack`, `length`, `number`, `text`.

**The plugin builds its form by reading this.** There are no hand-written color
pickers: you add a token together with its schema entry and its control shows
up on its own. A token with no schema entry is a validation error.

`varSchema` is the same thing for `vars` — the text a format prints, such as the
footer notice. A var declared there becomes editable from the settings tab.

The final precedence for a var, highest first:

```
the note's frontmatter  >  the user's override  >  the theme pack
```
