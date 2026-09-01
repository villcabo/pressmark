# PDF fixtures

Real output of this tool, kept so the PDF tests have something honest to read.

They are checked in on purpose (`.gitignore` excludes `*.pdf` and makes an
exception for this folder): `src/pdf-info.test.ts` and `src/pdfjs.e2e.test.ts`
read them, and a clean clone that lacked them would fail for a reason that has
nothing to do with the code.

| File            | Pages | Made from                              |
| --------------- | ----- | -------------------------------------- |
| `one-page.pdf`  | 1     | a single short section                 |
| `note.pdf`      | 3     | `samples/02-note.md`, `note` theme     |
| `report.pdf`    | 4     | `samples/01-report.md`, `report` theme |
| `technical.pdf` | 4     | `samples/04-technical.md`, `technical` |

**The page counts came from `pdfinfo`, not from this repo's own code.** That is
the point of them: `pageCount()` is checked against a number an outside tool
produced, so the test cannot pass by agreeing with itself.

Regenerate with the CLI (`pressmark convert`) only if the themes change in a way
that alters pagination — and if you do, re-read the counts with `pdfinfo` and
update this table and the tests together.
