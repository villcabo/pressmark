// Package theme carga theme packs y resuelve su herencia.
//
// Un theme pack es una carpeta con theme.json y theme.css. La herencia se
// resuelve clave a clave (superficial) para los objetos, y apilando el CSS:
// primero el del padre, despues el propio.
package theme

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"strconv"
)

const BaseID = "_base"

// Value acepta string o numero en el JSON y siempre expone string, porque al
// emitirse como variable CSS todo termina siendo texto igual.
type Value string

func (v *Value) UnmarshalJSON(b []byte) error {
	if len(b) > 0 && b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		*v = Value(s)
		return nil
	}
	var f float64
	if err := json.Unmarshal(b, &f); err != nil {
		return fmt.Errorf("token: se esperaba string o numero, llego %s", b)
	}
	*v = Value(strconv.FormatFloat(f, 'f', -1, 64))
	return nil
}

// Size es A4/Letter/... o un tamano propio {width,height}.
type Size struct {
	Name   string
	Width  string
	Height string
}

func (s *Size) UnmarshalJSON(b []byte) error {
	if len(b) > 0 && b[0] == '"' {
		return json.Unmarshal(b, &s.Name)
	}
	var custom struct{ Width, Height string }
	if err := json.Unmarshal(b, &custom); err != nil {
		return err
	}
	s.Width, s.Height = custom.Width, custom.Height
	return nil
}

// MarshalJSON devuelve el mismo shape que entro: "A4" o {width,height}.
// Sin esto un theme resuelto no vuelve a ser un theme.json valido, y el plugin
// necesita justamente eso para guardar las personalizaciones del usuario.
func (s Size) MarshalJSON() ([]byte, error) {
	if s.Name != "" {
		return json.Marshal(s.Name)
	}
	return json.Marshal(struct {
		Width  string `json:"width"`
		Height string `json:"height"`
	}{s.Width, s.Height})
}

type Margin struct {
	Top    *string `json:"top,omitempty"`
	Right  *string `json:"right,omitempty"`
	Bottom *string `json:"bottom,omitempty"`
	Left   *string `json:"left,omitempty"`
}

type Page struct {
	Size            *Size    `json:"size,omitempty"`
	Orientation     *string  `json:"orientation,omitempty"`
	Margin          *Margin  `json:"margin,omitempty"`
	PrintBackground *bool    `json:"printBackground,omitempty"`
	Scale           *float64 `json:"scale,omitempty"`
}

type Cover struct {
	Enabled *bool   `json:"enabled,omitempty"`
	Break   *string `json:"break,omitempty"`
}

// Band es un encabezado o un pie. Se compone por ranuras; el margen lateral lo
// inyecta el renderer, para que nunca haya que sincronizarlo con Page.Margin.
type Band struct {
	Enabled  *bool      `json:"enabled,omitempty"`
	Left     *Localized `json:"left,omitempty"`
	Center   *Localized `json:"center,omitempty"`
	Right    *Localized `json:"right,omitempty"`
	Rule     *bool      `json:"rule,omitempty"`
	FontSize *string    `json:"fontSize,omitempty"`
	Color    *string    `json:"color,omitempty"`
}

type TokenDef struct {
	Type        string    `json:"type"`
	Label       Localized `json:"label"`
	Group       string    `json:"group,omitempty"`
	Description Localized `json:"description,omitempty"`
}

type Font struct {
	Family string   `json:"family"`
	Weight any      `json:"weight,omitempty"`
	Style  string   `json:"style,omitempty"`
	Files  []string `json:"files"`
}

type Theme struct {
	ID          string               `json:"id"`
	Name        Localized            `json:"name"`
	Description Localized            `json:"description,omitempty"`
	Version     string               `json:"version"`
	Author      string               `json:"author,omitempty"`
	Extends     json.RawMessage      `json:"extends,omitempty"`
	Highlight   *string              `json:"highlight,omitempty"`
	Tokens      map[string]Value     `json:"tokens,omitempty"`
	TokenSchema map[string]TokenDef  `json:"tokenSchema,omitempty"`
	Page        *Page                `json:"page,omitempty"`
	Cover       *Cover               `json:"cover,omitempty"`
	Header      *Band                `json:"header,omitempty"`
	Footer      *Band                `json:"footer,omitempty"`
	Vars        map[string]Localized `json:"vars,omitempty"`
	VarSchema   map[string]TokenDef  `json:"varSchema,omitempty"`
	Fonts       []Font               `json:"fonts,omitempty"`
}

// parent devuelve el id del padre. Ausente implica "_base"; null explicito, nada.
func (t *Theme) parent() (string, bool) {
	if len(t.Extends) == 0 {
		return BaseID, true
	}
	var s *string
	if err := json.Unmarshal(t.Extends, &s); err != nil || s == nil {
		return "", false
	}
	return *s, true
}

// Resolved es un theme con la cadena de herencia ya aplicada y el CSS apilado.
type Resolved struct {
	Theme
	CSS   string
	Chain []string // del ancestro mas lejano al propio
}

// Load resuelve el theme id dentro de fsys, siguiendo la cadena de extends.
func Load(fsys fs.FS, id string) (*Resolved, error) {
	seen := map[string]bool{}
	var chain []*Theme
	var css []byte

	for cur := id; cur != ""; {
		if seen[cur] {
			return nil, fmt.Errorf("herencia circular de themes en %q", cur)
		}
		seen[cur] = true

		raw, err := fs.ReadFile(fsys, path.Join(cur, "theme.json"))
		if err != nil {
			return nil, fmt.Errorf("theme %q: %w", cur, err)
		}
		var t Theme
		if err := json.Unmarshal(raw, &t); err != nil {
			return nil, fmt.Errorf("theme %q: theme.json invalido: %w", cur, err)
		}
		if t.ID != cur {
			return nil, fmt.Errorf("theme %q: el id declarado es %q", cur, t.ID)
		}
		chain = append([]*Theme{&t}, chain...) // el padre queda antes

		next, ok := t.parent()
		if !ok {
			break
		}
		cur = next
	}

	out := &Resolved{}
	for _, t := range chain {
		out.Chain = append(out.Chain, t.ID)
		merge(&out.Theme, t)

		// El CSS se apila, no se mezcla: el del padre primero.
		b, err := fs.ReadFile(fsys, path.Join(t.ID, "theme.css"))
		if err != nil {
			return nil, fmt.Errorf("theme %q: %w", t.ID, err)
		}
		css = append(css, "\n/* ── "...)
		css = append(css, t.ID...)
		css = append(css, " ── */\n"...)
		css = append(css, b...)
	}
	out.CSS = string(css)

	// La identidad es la del theme pedido, no la del ancestro.
	last := chain[len(chain)-1]
	out.ID, out.Name, out.Description = last.ID, last.Name, last.Description
	out.Version, out.Author = last.Version, last.Author
	return out, nil
}

func merge(dst, src *Theme) {
	if src.Highlight != nil {
		dst.Highlight = src.Highlight
	}
	dst.Tokens = mergeMap(dst.Tokens, src.Tokens)
	dst.Vars = mergeMap(dst.Vars, src.Vars)
	dst.TokenSchema = mergeMap(dst.TokenSchema, src.TokenSchema)
	dst.VarSchema = mergeMap(dst.VarSchema, src.VarSchema)
	if len(src.Fonts) > 0 {
		dst.Fonts = append(dst.Fonts, src.Fonts...)
	}
	dst.Page = mergePage(dst.Page, src.Page)
	dst.Cover = mergeCover(dst.Cover, src.Cover)
	dst.Header = mergeBand(dst.Header, src.Header)
	dst.Footer = mergeBand(dst.Footer, src.Footer)
}

func mergeMap[V any](dst, src map[string]V) map[string]V {
	if src == nil {
		return dst
	}
	if dst == nil {
		dst = make(map[string]V, len(src))
	}
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func pick[T any](dst, src *T) *T {
	if src != nil {
		return src
	}
	return dst
}

func mergePage(dst, src *Page) *Page {
	if src == nil {
		return dst
	}
	if dst == nil {
		dst = &Page{}
	}
	out := *dst
	out.Size = pick(out.Size, src.Size)
	out.Orientation = pick(out.Orientation, src.Orientation)
	out.PrintBackground = pick(out.PrintBackground, src.PrintBackground)
	out.Scale = pick(out.Scale, src.Scale)
	if src.Margin != nil {
		if out.Margin == nil {
			out.Margin = &Margin{}
		}
		m := *out.Margin
		m.Top = pick(m.Top, src.Margin.Top)
		m.Right = pick(m.Right, src.Margin.Right)
		m.Bottom = pick(m.Bottom, src.Margin.Bottom)
		m.Left = pick(m.Left, src.Margin.Left)
		out.Margin = &m
	}
	return &out
}

func mergeCover(dst, src *Cover) *Cover {
	if src == nil {
		return dst
	}
	if dst == nil {
		dst = &Cover{}
	}
	out := *dst
	out.Enabled = pick(out.Enabled, src.Enabled)
	out.Break = pick(out.Break, src.Break)
	return &out
}

func mergeBand(dst, src *Band) *Band {
	if src == nil {
		return dst
	}
	if dst == nil {
		dst = &Band{}
	}
	out := *dst
	out.Enabled = pick(out.Enabled, src.Enabled)
	out.Left = pick(out.Left, src.Left)
	out.Center = pick(out.Center, src.Center)
	out.Right = pick(out.Right, src.Right)
	out.Rule = pick(out.Rule, src.Rule)
	out.FontSize = pick(out.FontSize, src.FontSize)
	out.Color = pick(out.Color, src.Color)
	return &out
}

// List devuelve los themes seleccionables: los que empiezan con _ son internos.
func List(fsys fs.FS) ([]string, error) {
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if e.IsDir() && e.Name()[0] != '_' {
			out = append(out, e.Name())
		}
	}
	return out, nil
}
