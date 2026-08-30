// pressmark converts Markdown to PDF applying a theme pack.
//
// The layout engine is Chrome. This binary doesn't render: it drives Chrome
// over CDP. That's an important distinction — no Go package knows how to lay
// out CSS for print, and pretending otherwise would mean throwing away the
// themes.
package main

import (
	"context"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/chromedp/chromedp"
	"github.com/villcabo/pressmark/cli/internal/browser"

	"github.com/villcabo/pressmark/cli/internal/mermaid"
	"github.com/villcabo/pressmark/cli/internal/render"
	"github.com/villcabo/pressmark/cli/internal/theme"
	"github.com/villcabo/pressmark/cli/internal/themes"
)

const usage = `pressmark — converts Markdown to PDF using a theme pack

  The PDF is saved next to the .md file, with the same name.

USAGE
  pressmark <file.md | folder | *.md> [options]

OPTIONS
  -t, --theme <id>      Theme pack to apply (default: report)
      --letter          Letter size (default: the theme's)
      --a4              Force A4
      --margin <mm>     Uniform margin in millimeters, overrides the theme's
      --html            Generate the intermediate HTML instead of the PDF
  -o, --output <path>   Output file (only valid with a single input file)
      --themes <dir>    Directory of custom theme packs
      --chrome <path>   Chrome executable to use
  -l, --list            List the available theme packs
      --lang <code>     Language for the format's text (es, en, pt-BR...).
                         Defaults from LANG.
  -h, --help            This help

THEME PACKS
  These are looked up first in --themes (or ~/.config/pressmark/themes) and
  then among the ones bundled inside the binary. A custom theme can inherit
  from an embedded one: extends "_base" works even if _base isn't on disk.
`

type options struct {
	theme     string
	output    string
	themesDir string
	chrome    string
	margin    float64
	letter    bool
	a4        bool
	htmlOnly  bool
	list      bool
	lang      string
}

// langFromEnv reads LANG/LC_ALL and returns something like "es" or "pt-BR".
//
// The CLI doesn't have an app to tell it the language like the plugin does,
// so it looks at the environment instead. LANG usually comes as
// "es_BO.UTF-8": we need to keep just the language part and turn the
// underscore into a hyphen.
func langFromEnv() string {
	for _, v := range []string{os.Getenv("LC_ALL"), os.Getenv("LC_MESSAGES"), os.Getenv("LANG")} {
		v = strings.TrimSpace(v)
		if v == "" || v == "C" || v == "POSIX" {
			continue
		}
		if i := strings.IndexByte(v, '.'); i > 0 {
			v = v[:i]
		}
		return strings.ReplaceAll(v, "_", "-")
	}
	return "en"
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "pressmark:", err)
		os.Exit(1)
	}
}

func run() error {
	var o options
	fs_ := flag.NewFlagSet("pressmark", flag.ContinueOnError)
	fs_.SetOutput(os.Stderr)
	fs_.Usage = func() { fmt.Fprint(os.Stderr, usage) }

	fs_.StringVar(&o.theme, "theme", "report", "")
	fs_.StringVar(&o.theme, "t", "report", "")
	fs_.StringVar(&o.output, "output", "", "")
	fs_.StringVar(&o.output, "o", "", "")
	fs_.StringVar(&o.themesDir, "themes", "", "")
	fs_.StringVar(&o.chrome, "chrome", "", "")
	fs_.Float64Var(&o.margin, "margin", 0, "")
	fs_.BoolVar(&o.letter, "letter", false, "")
	fs_.BoolVar(&o.a4, "a4", false, "")
	fs_.BoolVar(&o.htmlOnly, "html", false, "")
	fs_.BoolVar(&o.list, "list", false, "")
	fs_.BoolVar(&o.list, "l", false, "")
	fs_.StringVar(&o.lang, "lang", "", "")

	if err := fs_.Parse(reorderArgs(fs_, os.Args[1:])); err != nil {
		return err
	}

	if o.lang == "" {
		o.lang = langFromEnv()
	}
	packs := theme.Overlay(theme.UserDir(o.themesDir), themes.FS())

	if o.list {
		return listThemes(packs, o.lang)
	}
	inputs, err := expand(fs_.Args())
	if err != nil {
		return err
	}
	if len(inputs) == 0 {
		fmt.Fprint(os.Stderr, usage)
		return fmt.Errorf("no .md files given")
	}
	if o.output != "" && len(inputs) > 1 {
		return fmt.Errorf("--output only works with a single input file, but got %d", len(inputs))
	}

	t, err := theme.Load(packs, o.theme)
	if err != nil {
		available, _ := theme.List(packs)
		return fmt.Errorf("%w\n  available themes: %s", err, strings.Join(available, ", "))
	}

	return convert(inputs, t, o)
}

// reorderArgs moves flags to the front and sends the files to the end.
//
// The flag package stops parsing at the first positional argument, so
// `pressmark report.md --theme note` would arrive as three files. The bash
// script this replaces accepted flags in any position, and breaking that
// ergonomics just to avoid writing this function isn't worth it.
func reorderArgs(fset *flag.FlagSet, args []string) []string {
	isBool := func(name string) bool {
		f := fset.Lookup(strings.TrimLeft(name, "-"))
		if f == nil {
			return false
		}
		b, ok := f.Value.(interface{ IsBoolFlag() bool })
		return ok && b.IsBoolFlag()
	}

	var flags, positional []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a == "--" { // everything after this is a file, even if it looks like a flag
			positional = append(positional, args[i+1:]...)
			break
		}
		if !strings.HasPrefix(a, "-") || a == "-" {
			positional = append(positional, a)
			continue
		}
		flags = append(flags, a)
		// --flag=value already carries the value; --flag value grabs the next one
		if !strings.Contains(a, "=") && !isBool(a) && i+1 < len(args) {
			i++
			flags = append(flags, args[i])
		}
	}
	return append(flags, positional...)
}

func listThemes(packs fs.FS, locale string) error {
	ids, err := theme.List(packs)
	if err != nil {
		return err
	}
	sort.Strings(ids)
	for _, id := range ids {
		t, err := theme.Load(packs, id)
		if err != nil {
			fmt.Printf("  %-12s (won't load: %v)\n", id, err)
			continue
		}
		cover := "no cover"
		if t.Cover != nil && t.Cover.Enabled != nil && *t.Cover.Enabled {
			cover = "with cover"
		}
		fmt.Printf("  %-12s %-13s %s\n", id, cover, t.Description.Resolve(locale))
	}
	return nil
}

func expand(args []string) ([]string, error) {
	var out []string
	for _, a := range args {
		st, err := os.Stat(a)
		if err != nil {
			return nil, fmt.Errorf("no such file: %q", a)
		}
		if !st.IsDir() {
			out = append(out, a)
			continue
		}
		e, err := os.ReadDir(a)
		if err != nil {
			return nil, err
		}
		for _, f := range e {
			if !f.IsDir() && strings.EqualFold(filepath.Ext(f.Name()), ".md") {
				out = append(out, filepath.Join(a, f.Name()))
			}
		}
	}
	sort.Strings(out)
	return out, nil
}

func convert(inputs []string, t *theme.Resolved, o options) error {
	opts, err := pdfOptions(t, o)
	if err != nil {
		return err
	}

	var chrome *browser.Chrome
	if !o.htmlOnly {
		// A single Chrome for all files, not one per file.
		chrome, err = browser.New(context.Background(), o.chrome)
		if err != nil {
			return err
		}
		defer chrome.Close()
	}

	for _, in := range inputs {
		src, err := os.ReadFile(in)
		if err != nil {
			return err
		}
		// The frontmatter is stripped BEFORE anything else: its opening `---`
		// would be the document's first <hr> and would trigger the cover
		// break right there.
		fm, src := render.SplitFrontmatter(src)
		title := render.TitleFrom(fm, src, strings.TrimSuffix(filepath.Base(in), filepath.Ext(in)))

		// Diagrams are extracted BEFORE the highlighter: if they go through
		// chroma they come out full of <span> and mermaid can no longer
		// parse them.
		src, hasDiagrams := mermaid.Extract(src)

		hl := ""
		if t.Highlight != nil {
			hl = *t.Highlight
		}
		body, err := render.Markdown(src, hl)
		if err != nil {
			return fmt.Errorf("%s: %w", in, err)
		}
		rdoc := render.Doc{Title: title, Body: body, Lang: o.lang, Theme: t}
		if hasDiagrams && !o.htmlOnly {
			rdoc.ScriptJS = mermaid.LibJS()
		}
		doc := render.HTML(rdoc)

		ext, data := ".pdf", []byte(nil)
		if o.htmlOnly {
			ext, data = ".html", doc
		} else {
			op := opts
			vars := render.MergeVars(t.Vars, fm, o.lang)
			op.Header = browser.BandOrEmpty(render.BandHTML(t.Header, marginOf(t), vars, title, o.lang))
			op.Footer = browser.BandOrEmpty(render.BandHTML(t.Footer, marginOf(t), vars, title, o.lang))
			op.ShowBands = enabled(t.Header) || enabled(t.Footer)
			var steps []browser.Prep
			if hasDiagrams {
				steps = append(steps, func(*browser.PDFOptions) chromedp.Action {
					return browser.AwaitJS(mermaid.InitJS(
						token(t, "accent", "#1e4d3b"),
						token(t, "accent-soft", "#f2f7f4"),
						token(t, "ink", "#16222b")))
				})
			}
			data, err = chrome.PDF(doc, filepath.Dir(in), op, steps...)
			if err != nil {
				return fmt.Errorf("%s: %w", in, err)
			}
		}

		out := o.output
		if out == "" {
			out = strings.TrimSuffix(in, filepath.Ext(in)) + ext
		}
		if err := os.WriteFile(out, data, 0o644); err != nil {
			return err
		}
		st, _ := os.Stat(out)
		fmt.Printf("✓ %s  (%.0f KB)\n", out, float64(st.Size())/1024)
	}
	return nil
}

// token reads a design token from the resolved theme. Diagrams pick up the
// document's palette: otherwise the flowchart clashes with everything around
// it.
func token(t *theme.Resolved, name, fallback string) string {
	if v, ok := t.Tokens[name]; ok && v != "" {
		return string(v)
	}
	return fallback
}

func enabled(b *theme.Band) bool {
	return b != nil && b.Enabled != nil && *b.Enabled
}

func marginOf(t *theme.Resolved) *theme.Margin {
	if t.Page == nil {
		return nil
	}
	return t.Page.Margin
}

func pdfOptions(t *theme.Resolved, o options) (browser.PDFOptions, error) {
	var out browser.PDFOptions
	out.Background = true

	name := "A4"
	if t.Page != nil && t.Page.Size != nil {
		if t.Page.Size.Name != "" {
			name = t.Page.Size.Name
		} else {
			w, err := render.ToInches(t.Page.Size.Width)
			if err != nil {
				return out, err
			}
			h, err := render.ToInches(t.Page.Size.Height)
			if err != nil {
				return out, err
			}
			out.PaperWidth, out.PaperHeight = w, h
		}
	}
	switch {
	case o.letter:
		name = "Letter"
	case o.a4:
		name = "A4"
	}
	if out.PaperWidth == 0 {
		w, h, err := render.PaperSize(name)
		if err != nil {
			return out, err
		}
		out.PaperWidth, out.PaperHeight = w, h
	}

	if t.Page != nil {
		if t.Page.PrintBackground != nil {
			out.Background = *t.Page.PrintBackground
		}
		if t.Page.Scale != nil {
			out.Scale = *t.Page.Scale
		}
		if t.Page.Orientation != nil && *t.Page.Orientation == "landscape" {
			out.Landscape = true
		}
	}

	var m theme.Margin
	if t.Page != nil && t.Page.Margin != nil {
		m = *t.Page.Margin
	}
	for _, l := range []struct {
		src *string
		dst *float64
	}{
		{m.Top, &out.MarginTop},
		{m.Right, &out.MarginRight},
		{m.Bottom, &out.MarginBottom},
		{m.Left, &out.MarginLeft},
	} {
		if l.src == nil {
			continue
		}
		in, err := render.ToInches(*l.src)
		if err != nil {
			return out, err
		}
		*l.dst = in
	}

	if o.margin > 0 {
		in := o.margin / 25.4
		out.MarginTop, out.MarginRight, out.MarginBottom, out.MarginLeft = in, in, in, in
	}
	return out, nil
}
