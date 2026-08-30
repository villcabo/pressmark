package render

import (
	"fmt"
	"html"
	"strings"

	"github.com/villcabo/pressmark/cli/internal/theme"
)

// Chrome renderiza header y footer en un contexto APARTE del documento: no ven
// el CSS de la pagina ni heredan tamano de fuente. Todo va en estilos inline, y
// el tamano hay que declararlo o sale ilegible.
//
// El margen lateral lo inyectamos nosotros desde page.margin. Ese es el punto:
// en el formato viejo estaba escrito a mano en el template y quedo 1mm corrido
// del cuerpo en los 6 temas.
func BandHTML(b *theme.Band, m *theme.Margin, vars map[string]string, title, locale string) string {
	if b == nil || b.Enabled == nil || !*b.Enabled {
		return "<span></span>" // Chrome exige algo; vacio de verdad lo rompe
	}

	izq, der := "0", "0"
	if m != nil {
		if m.Left != nil {
			izq = *m.Left
		}
		if m.Right != nil {
			der = *m.Right
		}
	}

	size := "7pt"
	if b.FontSize != nil {
		size = *b.FontSize
	}
	color := "#8a9099"
	if b.Color != nil {
		color = *b.Color
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, `<div style="width:100%%;box-sizing:border-box;`+
		`font-family:'Inter','Segoe UI',sans-serif;font-size:%s;color:%s;`+
		`padding:0 %s 0 %s;display:flex;justify-content:space-between;align-items:center;`,
		size, color, der, izq)
	if b.Rule != nil && *b.Rule {
		sb.WriteString("border-top:0.5pt solid #e4e7ea;padding-top:2mm;")
	}
	sb.WriteString(`">`)

	// Tres ranuras siempre, aunque esten vacias: si no, flex desbalancea el centro.
	for _, s := range []*theme.Localized{b.Left, b.Center, b.Right} {
		sb.WriteString("<span>")
		if s != nil {
			sb.WriteString(expand(s.Resolve(locale), vars, title))
		}
		sb.WriteString("</span>")
	}
	sb.WriteString("</div>")
	return sb.String()
}

// MergeVars junta las vars del theme con los campos del frontmatter, que
// quedan accesibles como {{fm.clave}}. Asi un pie puede llevar el sistema o el
// ambiente de la nota sin que el theme sepa nada de ese documento.
func MergeVars(vars map[string]theme.Localized, fm map[string]string, locale string) map[string]string {
	out := make(map[string]string, len(vars)+len(fm))
	for k, v := range vars {
		out[k] = v.Resolve(locale)
	}
	for k, v := range fm {
		out["fm."+k] = v
	}
	return out
}

// expand resuelve los placeholders. pageNumber/totalPages/title/date son clases
// que Chrome rellena solo; el resto sale de vars.
func expand(s string, vars map[string]string, title string) string {
	rep := []string{
		"{{page}}", `<span class="pageNumber"></span>`,
		"{{pages}}", `<span class="totalPages"></span>`,
		"{{date}}", `<span class="date"></span>`,
		"{{title}}", html.EscapeString(title),
		"{{file}}", `<span class="url"></span>`,
	}
	for k, v := range vars {
		rep = append(rep, "{{vars."+k+"}}", html.EscapeString(v))
	}
	return strings.NewReplacer(rep...).Replace(s)
}
