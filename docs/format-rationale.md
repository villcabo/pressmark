# Why the theme pack format looks like this

Pressmark's format did not start from a blank page. It came out of a working
bash script and six CSS files that had been in daily use for months. Migrating
them surfaced a handful of bugs, and those bugs are the reason several
decisions in the format are the way they are.

This document exists so nobody undoes them by accident.

## 1. The margin was declared twice and never matched

All six themes declared page margins in two places, and in every single one the
two values disagreed:

| Theme | `@page` in CSS | `.pdf.json` | Differed in |
| ----- | -------------- | ----------- | ----------- |
| `executive` | `26mm 23mm 20mm 23mm` | `26mm 22mm 20mm 22mm` | sides |
| `report` | `24mm 19mm 18mm 19mm` | `24mm 18mm 18mm 18mm` | sides |
| `minimal` | `28mm 25mm 22mm 25mm` | `28mm 24mm 22mm 24mm` | sides |
| `modern` | `24mm 21mm 20mm 21mm` | `24mm 20mm 20mm 20mm` | sides |
| `note` | `18mm 17mm 16mm 17mm` | `16mm 15mm 16mm 15mm` | all four |
| `technical` | `20mm 16mm 18mm 16mm` | `20mm 15mm 18mm 15mm` | sides |

**Verified cause:** there were two pipelines reading different sources. One went
through a Puppeteer wrapper and passed the JSON margin to `printToPDF`; the
other called `chrome --print-to-pdf`, which **has no margin flag at all** and
takes them solely from the CSS `@page` rule.

Neither was wrong. They served different scripts and drifted apart with nothing
to warn anyone. The pattern gives it away: the CSS was exactly 1mm wider on the
sides in five of the six.

### Which one actually won: measured, not assumed

The same document was printed three times, varying only the CSS, and the real
text position was measured with `pdftotext -bbox` (A4, `report` theme):

| `@page` in CSS | `printToPDF` margin | body x | Winner |
| -------------- | ------------------- | ------ | ------ |
| `19mm` | `18mm` | 54.0 pt = 19mm | CSS |
| `40mm` | `18mm` | 114.0 pt = 40mm | CSS |
| *absent* | `18mm` | 51.0 pt = 18mm | `printToPDF` |

**Conclusion:** when `@page` is present Chrome applies it to the body and
**ignores** the `printToPDF` margin. With no `@page`, the `printToPDF` margin
governs.

Two consequences:

**1. `page.margin` carries the `@page` values**, not the JSON ones. Those are
what actually produced the documents. The first pass of this migration kept the
JSON values — that was wrong, and the measurement corrected it.

**2. The footer had been misaligned with the body the whole time.** In `report`
the body starts at 19mm (from `@page`) and the footer at 18mm (from a
`padding: 0 18mm` hardcoded into the footer template). One millimetre off, in
all six themes.

**The measurement is also what validates the current design.** With no `@page`
in the CSS — exactly what `tools/validate.mjs` now enforces — the `printToPDF`
margin governs the body cleanly and unambiguously. One source of truth, and it
works.

## 2. The footer had its text and its margin baked in

The old footer was raw HTML with `"Confidential · internal use"` inside it and a
`padding: 0 18mm` that had to be kept in sync with `margin.left` by hand.

Now it is slots:

```json
"footer": { "left": "{{vars.confidentiality}}", "right": "Page {{page}} of {{pages}}" },
"vars":   { "confidentiality": "Confidential · internal use" }
```

The renderer injects the margin itself. There are no longer two numbers that
have to agree.

## 3. The cover was an absence; now it is a declaration

No theme defined a `.cover` class. The cover is **a convention**: the first
`h1`, the paragraph or table that follows it, and the first `<hr>`, which closes
it with a page break.

The real discriminator turned out to be `break-after: page`, not the `h1`
styling: `note` styles the first `<hr>` but does **not** break, which is why it
has no cover. Detecting it by the `h1` gave a false positive. It is explicit
now: `"cover": { "enabled": false, "break": "none" }`.

## 4. Cover height became the `cover-offset` token

It used to be a fixed number in each theme's CSS. As a token, a full cover
becomes a half-page one from the settings UI, without touching CSS.

## 5. HTML structure contract: `.pm-doc`

The selectors used to be `body > h1:first-of-type`. Inside Obsidian the content
does not hang off `<body>`, so **the cover would never have worked in the
plugin**.

Both renderers wrap the document in `<article class="pm-doc">` and guarantee
top-level blocks are direct children. That contract is what makes the same theme
pack behave identically on both sides.

## 6. Frontmatter is stripped before rendering

A note that opens with YAML frontmatter opens with `---`. In CommonMark that is
the document's first `<hr>` — and the cover closes on the first `<hr>`. The page
break landed there: a blank cover page, with the frontmatter printed on page two.

Measured on a real document. Both implementations now strip frontmatter
explicitly, and its fields are available in headers and footers as `{{fm.field}}`.

## 7. Obsidian's UI chrome is removed from the printed document

Obsidian's renderer returns the DOM as it looks in the app, buttons included.
The "copy code" button was printed inside a code block in a real PDF. Collapsed
callouts are also expanded before printing: on paper nothing unfolds.
