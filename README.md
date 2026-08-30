# Pressmark

Export Obsidian notes to PDF using **portable theme packs** — formats you can
version in git, share with your team, and reuse from the command line.

The layout engine is Chromium in both cases. What changes is who drives it.
What does **not** change is the theme pack.

> The same theme pack produces the same PDF from your vault and from your
> terminal.

## Why another PDF exporter

There are plenty of PDF exporters for Obsidian. None of them has a portable
format: a folder with a stylesheet and a JSON file that you commit to a repo,
review in a pull request, and hand to a colleague so their documents come out
looking exactly like yours.

That format is the product. The plugin is how you use it inside Obsidian; the
CLI is how you use it everywhere else.

## Features

- **Export dialog with a live preview** at the real paper proportion, with
  simulated margins and dashed marks where each page will break.
- **Six built-in formats**, from a dense technical spec to an executive report.
- **Customization UI that builds itself** from the theme pack's schema. Change
  colors, fonts, cover height and footer text without writing a line of CSS.
- **Mermaid diagrams** rendered as vector graphics, using the format's palette.
- **Cover pages by convention** — no special markup. Your first heading, the
  paragraph or table that follows it, and the first `---`.
- **Multilingual**: the interface and the document text follow Obsidian's
  language. English and Spanish included.
- **Your own theme packs**, kept inside the vault at
  `.obsidian/pressmark/themes/`.

## Built-in formats

| Format | Cover | Made for |
| ------ | ----- | -------- |
| `report` | full page | Formal reports. The canonical one. |
| `note` | none | Diagnostics and lists. Starts right away. |
| `executive` | full page | Leadership and steering committees. |
| `technical` | half page | Specs with a lot of code. Dense. |
| `minimal` | full page | No color at all. Prints the same in black and white. |
| `modern` | full page | Proposals and product documents. |

## Usage

Open a note and click the ribbon icon, or run **Pressmark: Export to PDF** from
the command palette. Pick a format, check the preview, export.

## Theme packs

A theme pack is a folder with `theme.json` and `theme.css`. There are three
levels of customization, with very different costs:

| Level | What you touch | Who it is for |
| ----- | -------------- | ------------- |
| 1 | `tokens` in `theme.json` — colors and fonts | Most people. It is a form in the settings tab. |
| 2 | `page`, `cover`, `footer` | Anyone who needs their own margins and footer. |
| 3 | Your own `theme.css`, with `extends` | Anyone who knows CSS. |

Custom packs go in `.obsidian/pressmark/themes/<id>/` inside your vault. A pack
of your own can inherit from a built-in one: `extends: "_base"` works even
though `_base` ships inside the plugin.

See [`docs/theme-format.md`](docs/theme-format.md) for the full format, and
[`docs/format-rationale.md`](docs/format-rationale.md) for why it is shaped the
way it is — most of its rules exist because something broke first.

## Command line

The CLI is a single static Go binary. Its only external dependency is an
installed Chrome — no Node, no Puppeteer, no `mmdc`.

```bash
make build                                  # -> dist/pressmark

pressmark report.md                         # PDF next to the .md
pressmark report.md --theme technical       # another format
pressmark reports/ --theme note --letter    # a whole folder
pressmark --list                            # available formats
```

## How both sides stay identical

Not by sharing code — the CLI parses with goldmark and the plugin uses
Obsidian's own renderer, and it has to be that way: only Obsidian resolves
wikilinks, embeds, callouts and Dataview blocks. Consistency comes from three
things:

1. **The theme pack**, which is literally the same file.
2. **An HTML structure contract**: both wrap the document in
   `<article class="pm-doc">` and guarantee top-level blocks are direct
   children. The cover CSS depends on it.
3. **Conformance fixtures** in `testdata/conformance/`, run by *both*
   implementations. Inheritance, frontmatter and locale resolution are pinned
   down by shared JSON cases. If the two sides drift, the suite fails.

## Development

```bash
bun install
make build      # validates theme packs, builds the CLI
make plugin     # builds the plugin -> main.js
make install    # installs into a vault (VAULT=... to pick one)
make test       # Go and TypeScript, conformance included
```

## Requirements

Desktop only. The plugin uses Electron's `printToPDF`, which is not available
on mobile.

## License

MIT
