package render

import (
	"bytes"
	"fmt"
	"html"
	"sort"
	"strings"

	"github.com/yuin/goldmark"
	hl "github.com/yuin/goldmark-highlighting/v2"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	ghtml "github.com/yuin/goldmark/renderer/html"

	"github.com/villcabo/pressmark/cli/internal/theme"
)

// Wrapper is the HTML structure contract shared by the CLI and the plugin.
// Top-level blocks have to be DIRECT children of this element: the themes'
// CSS depends on that (.pm-doc > h1:first-of-type builds the cover). If the
// plugin nests the content, the cover doesn't work.
const Wrapper = "pm-doc"

func Markdown(src []byte, highlight string) ([]byte, error) {
	if highlight == "" {
		highlight = "github"
	}
	md := goldmark.New(
		goldmark.WithExtensions(
			extension.GFM,
			extension.Footnote,
			extension.Typographer,
			hl.NewHighlighting(
				hl.WithStyle(highlight),
				hl.WithFormatOptions(),
			),
		),
		goldmark.WithParserOptions(
			parser.WithAutoHeadingID(),
		),
		goldmark.WithRendererOptions(
			ghtml.WithUnsafe(), // markdown may carry its own HTML, e.g. forced line breaks
		),
	)
	var buf bytes.Buffer
	if err := md.Convert(src, &buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// TokensCSS emits the design tokens as :root variables. It goes BEFORE the
// theme's CSS, which consumes them with var(--name). That's why a theme.css
// doesn't declare :root itself: the renderer generates it from theme.json,
// which is the single source of truth.
func TokensCSS(tokens map[string]theme.Value) string {
	if len(tokens) == 0 {
		return ""
	}
	names := make([]string, 0, len(tokens))
	for k := range tokens {
		names = append(names, k)
	}
	sort.Strings(names) // stable output: the golden corpus compares byte for byte

	var sb strings.Builder
	sb.WriteString(":root {\n")
	for _, k := range names {
		fmt.Fprintf(&sb, "  --%s: %s;\n", k, tokens[k])
	}
	sb.WriteString("}\n")
	return sb.String()
}

// CoverCSS translates cover.break into the first-<hr> rule. It lives here and
// not in the theme's CSS because it's a decision declared in theme.json.
func CoverCSS(c *theme.Cover) string {
	if c == nil || c.Enabled == nil || !*c.Enabled {
		return ""
	}
	if c.Break != nil && *c.Break == "none" {
		return ""
	}
	return fmt.Sprintf(
		".%s > hr:first-of-type { break-after: page; border: none; margin: 0; height: 0; }\n",
		Wrapper)
}

type Doc struct {
	Title    string
	Body     []byte
	Lang     string // BCP-47 tag for the <html lang> attribute
	Theme    *theme.Resolved
	FontCSS  string // @font-face for bundled fonts, if any
	ScriptJS string // embedded mermaid.js, only when the document has diagrams
}

// HTML assembles the complete document handed to Chrome.
func HTML(d Doc) []byte {
	var sb bytes.Buffer
	// The lang attribute drives hyphenation and quote shaping in the print
	// engine. Hardcoding one language gets those wrong for every other.
	lang := d.Lang
	if lang == "" {
		lang = "en"
	}
	fmt.Fprintf(&sb, "<!doctype html>\n<html lang=%q>\n<head>\n", lang)
	sb.WriteString("<meta charset=\"utf-8\">\n")
	fmt.Fprintf(&sb, "<title>%s</title>\n", html.EscapeString(d.Title))

	// Minimal reset. The 8px margin browsers put on <body> is not cosmetic:
	// it shifts the WHOLE document and misaligns the body against the footer,
	// which is positioned using printToPDF's margin. Measured: a 5.25pt
	// offset.
	sb.WriteString("<style>\nhtml, body { margin: 0; padding: 0; }\n</style>\n")

	sb.WriteString("<style>\n")
	sb.WriteString(TokensCSS(d.Theme.Tokens))
	sb.WriteString("</style>\n")

	if d.FontCSS != "" {
		sb.WriteString("<style>\n")
		sb.WriteString(d.FontCSS)
		sb.WriteString("</style>\n")
	}

	sb.WriteString("<style>\n")
	sb.WriteString(d.Theme.CSS)
	sb.WriteString("\n")
	sb.WriteString(CoverCSS(d.Theme.Cover))
	sb.WriteString("</style>\n")

	if d.ScriptJS != "" {
		// Goes in <head> without defer: it has to be defined before the Prep
		// step invokes it from CDP.
		sb.WriteString("<script>\n")
		sb.WriteString(d.ScriptJS)
		sb.WriteString("\n</script>\n")
	}

	sb.WriteString("</head>\n<body>\n")
	fmt.Fprintf(&sb, "<article class=%q>\n", Wrapper)
	sb.Write(d.Body)
	sb.WriteString("\n</article>\n</body>\n</html>\n")
	return sb.Bytes()
}

// Title extracts the title from the markdown's first h1. Used for {{title}}
// and for the document's <title>.
func Title(src []byte, fallback string) string {
	for _, l := range strings.Split(string(src), "\n") {
		if t, ok := strings.CutPrefix(strings.TrimSpace(l), "# "); ok {
			return strings.TrimSpace(t)
		}
	}
	return fallback
}
