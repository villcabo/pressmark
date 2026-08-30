# Contributing

Thanks for looking. A few things worth knowing before you start.

## Language

Everything in this repository is in **English**: issues, pull requests, commit
messages, code, comments and documentation.

The one exception is translated user-facing text — the `es` block in
`plugin/src/i18n.ts` and the `"es"` values inside theme packs. Those are the
product.

## Workflow

Work happens on branches and lands through pull requests. `main` is protected.

```bash
git switch -c fix/some-thing
# ...
git commit -S -s -m "fix: describe what changed"
gh pr create
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org) and
are a single line. The reasoning goes in the pull request body, where a reviewer
will actually read it, not in `git log`.

## Setup

```bash
bun install
make build      # validates theme packs, builds the CLI
bun run build   # builds the plugin -> main.js
make install    # installs into a vault (VAULT=... to pick one)
make test       # Go and TypeScript, conformance included
bunx eslint plugin/src
```

`make install` defaults to the maintainer's vault path. Pass your own.

## The one rule that matters

The CLI and the plugin have **separate** Markdown pipelines, and they have to:
only Obsidian resolves wikilinks, embeds, callouts and Dataview. What keeps
their output identical is not shared code, it is:

1. The theme pack, which is literally the same file.
2. The HTML structure contract — both wrap the document in
   `<article class="pm-doc">` with top-level blocks as direct children.
3. The conformance fixtures in `testdata/conformance/`, which **both**
   implementations run.

If you change inheritance, frontmatter or locale resolution, change the
fixture first and fix both sides. A change that only touches one side is a bug
waiting to happen, and the suite will tell you so.

## Testable code does not import Obsidian

Anything that imports `obsidian` cannot be unit tested outside the app. That is
why `document.ts`, `config.ts`, `paper.ts` and `locale.ts` exist separately from
`render.ts`, `settings.ts` and `pdf.ts`. Put logic that needs a test in a module
that does not touch Obsidian.

## Theme packs

`theme.css` may not declare `:root` or `@page` — the palette and page geometry
live in `theme.json` and the validator rejects the alternative. See
[`docs/format-rationale.md`](docs/format-rationale.md) for why that rule exists.
