package render

import (
	"fmt"
	"html"
	"strings"

	"github.com/villcabo/pressmark/cli/internal/theme"
)

// Chrome renders the header and footer in a context SEPARATE from the
// document: they don't see the page CSS and don't inherit font size.
// Everything goes in inline styles, and the size has to be declared or it
// comes out illegible.
//
// We inject the side margin ourselves from page.margin. That's the whole
// point: in the old format it was hand-written in the template and ended up
// 1mm off from the body across the 6 themes.
func BandHTML(b *theme.Band, m *theme.Margin, vars map[string]string, title, locale string) string {
	if b == nil || b.Enabled == nil || !*b.Enabled {
		return "<span></span>" // Chrome requires something; a real empty string breaks it
	}

	left, right := "0", "0"
	if m != nil {
		if m.Left != nil {
			left = *m.Left
		}
		if m.Right != nil {
			right = *m.Right
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
		size, color, right, left)
	if b.Rule != nil && *b.Rule {
		sb.WriteString("border-top:0.5pt solid #e4e7ea;padding-top:2mm;")
	}
	sb.WriteString(`">`)

	// Always three slots, even if empty: otherwise flex throws the centering off.
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

// MergeVars joins the theme's vars with the frontmatter fields, which become
// accessible as {{fm.key}}. That way a footer can carry the document's
// system or environment without the theme knowing anything about that
// document.
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

// expand resolves the placeholders. pageNumber/totalPages/title/date are
// classes that Chrome fills in on its own; everything else comes from vars.
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
