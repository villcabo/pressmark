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

// Wrapper es el contrato de estructura HTML que comparten el CLI y el plugin.
// Los bloques de primer nivel tienen que ser hijos DIRECTOS de este elemento:
// el CSS de los themes depende de eso (.pm-doc > h1:first-of-type arma la
// portada). Si el plugin anida el contenido, la portada no funciona.
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
			ghtml.WithUnsafe(), // el markdown puede traer HTML propio, ej. saltos forzados
		),
	)
	var buf bytes.Buffer
	if err := md.Convert(src, &buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// TokensCSS emite los design tokens como variables en :root. Va ANTES del CSS
// del theme, que los consume con var(--nombre). Por eso un theme.css no declara
// :root: lo genera el renderer desde theme.json, que es la fuente unica.
func TokensCSS(tokens map[string]theme.Value) string {
	if len(tokens) == 0 {
		return ""
	}
	nombres := make([]string, 0, len(tokens))
	for k := range tokens {
		nombres = append(nombres, k)
	}
	sort.Strings(nombres) // salida estable: el corpus golden compara byte a byte

	var sb strings.Builder
	sb.WriteString(":root {\n")
	for _, k := range nombres {
		fmt.Fprintf(&sb, "  --%s: %s;\n", k, tokens[k])
	}
	sb.WriteString("}\n")
	return sb.String()
}

// CoverCSS traduce cover.break a la regla del primer <hr>. Vive aca y no en el
// CSS del theme porque es una decision declarada en theme.json.
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
	Theme    *theme.Resolved
	FontCSS  string // @font-face de las fuentes empaquetadas, si las hay
	ScriptJS string // mermaid.js embebido, solo si el documento trae diagramas
}

// HTML arma el documento completo que se le da a Chrome.
func HTML(d Doc) []byte {
	var sb bytes.Buffer
	sb.WriteString("<!doctype html>\n<html lang=\"es\">\n<head>\n")
	sb.WriteString("<meta charset=\"utf-8\">\n")
	fmt.Fprintf(&sb, "<title>%s</title>\n", html.EscapeString(d.Title))

	// Reset minimo. El margen de 8px que el navegador le pone a <body> no es
	// cosmetico: corre TODO el documento y desalinea el cuerpo del pie, que se
	// posiciona con el margen de printToPDF. Medido: 5.25pt de corrimiento.
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
		// Va en <head> y sin defer: tiene que estar definido antes de que el
		// Prep lo invoque desde CDP.
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

// Title saca el titulo del primer h1 del markdown. Sirve para {{title}} y para
// el <title> del documento.
func Title(src []byte, fallback string) string {
	for _, l := range strings.Split(string(src), "\n") {
		if t, ok := strings.CutPrefix(strings.TrimSpace(l), "# "); ok {
			return strings.TrimSpace(t)
		}
	}
	return fallback
}
