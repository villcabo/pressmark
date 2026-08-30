package render

import (
	"encoding/json"
	"math"
	"os"
	"strings"
	"testing"

	"github.com/villcabo/pressmark/cli/internal/theme"
)

func TestToInches(t *testing.T) {
	casos := []struct {
		in     string
		quiere float64
		falla  bool
	}{
		{"25.4mm", 1, false},
		{"2.54cm", 1, false},
		{"1in", 1, false},
		{"72pt", 1, false},
		{"96px", 1, false},
		{"96", 1, false}, // numero pelado = px
		{" 18mm ", 18 / 25.4, false},
		{"18MM", 18 / 25.4, false},
		{"", 0, true},
		{"18 pulgadas", 0, true},
		{"abcmm", 0, true},
	}
	for _, c := range casos {
		got, err := ToInches(c.in)
		if c.falla {
			if err == nil {
				t.Errorf("ToInches(%q): esperaba error, obtuvo %v", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("ToInches(%q): %v", c.in, err)
			continue
		}
		if math.Abs(got-c.quiere) > 1e-9 {
			t.Errorf("ToInches(%q) = %v, quiere %v", c.in, got, c.quiere)
		}
	}
}

func TestPaperSize(t *testing.T) {
	w, h, err := PaperSize("a4")
	if err != nil || w != 8.27 || h != 11.69 {
		t.Errorf("A4 = %v x %v (%v)", w, h, err)
	}
	if _, _, err := PaperSize("A9"); err == nil {
		t.Error("A9 deberia fallar")
	}
}

func TestTokensCSSEsEstable(t *testing.T) {
	tok := map[string]theme.Value{"zeta": "1", "alfa": "2", "media": "3"}
	// Dos veces el mismo mapa tiene que dar el mismo texto: los mapas de Go
	// iteran en orden aleatorio y el corpus golden compara byte a byte.
	a, b := TokensCSS(tok), TokensCSS(tok)
	if a != b {
		t.Fatal("TokensCSS no es estable entre llamadas")
	}
	if !strings.Contains(a, "--alfa: 2;") {
		t.Errorf("falta el token alfa:\n%s", a)
	}
	if strings.Index(a, "--alfa") > strings.Index(a, "--zeta") {
		t.Error("los tokens no salieron ordenados")
	}
	if TokensCSS(nil) != "" {
		t.Error("sin tokens no deberia emitir :root")
	}
}

func ptr[T any](v T) *T { return &v }

// loc arma un texto localizable a partir de una cadena suelta.
func loc(v string) *theme.Localized { return &theme.Localized{Plano: v} }

func TestBandHTML(t *testing.T) {
	m := &theme.Margin{Left: ptr("19mm"), Right: ptr("21mm")}
	vars := map[string]string{"aviso": "Confidencial & interno"}
	const es = "es"

	t.Run("deshabilitada devuelve span vacio", func(t *testing.T) {
		if got := BandHTML(nil, m, vars, "T", es); got != "<span></span>" {
			t.Errorf("obtuvo %q", got)
		}
		if got := BandHTML(&theme.Band{Enabled: ptr(false)}, m, vars, "T", es); got != "<span></span>" {
			t.Errorf("obtuvo %q", got)
		}
	})

	t.Run("inyecta el margen del theme", func(t *testing.T) {
		b := &theme.Band{Enabled: ptr(true), Left: loc("{{vars.aviso}}"), Right: loc("{{page}}/{{pages}}")}
		got := BandHTML(b, m, vars, "T", es)
		// Este es el punto de todo: el padding sale de page.margin, no escrito
		// a mano. En el formato viejo quedo 1mm corrido del cuerpo.
		if !strings.Contains(got, "padding:0 21mm 0 19mm") {
			t.Errorf("no inyecto el margen:\n%s", got)
		}
		if !strings.Contains(got, `<span class="pageNumber"></span>`) {
			t.Errorf("no expandio {{page}}:\n%s", got)
		}
		if !strings.Contains(got, `<span class="totalPages"></span>`) {
			t.Errorf("no expandio {{pages}}:\n%s", got)
		}
		if !strings.Contains(got, "Confidencial &amp; interno") {
			t.Errorf("no escapo el var:\n%s", got)
		}
		if strings.Count(got, "<span>") != 3 {
			t.Errorf("deberian ser 3 ranuras siempre, para que flex no descentre:\n%s", got)
		}
	})

	t.Run("sin margen no revienta", func(t *testing.T) {
		b := &theme.Band{Enabled: ptr(true), Center: loc("x")}
		if got := BandHTML(b, nil, nil, "", es); !strings.Contains(got, "padding:0 0 0 0") {
			t.Errorf("obtuvo %q", got)
		}
	})
}

func TestCoverCSS(t *testing.T) {
	if CoverCSS(nil) != "" {
		t.Error("sin cover no deberia emitir nada")
	}
	if CoverCSS(&theme.Cover{Enabled: ptr(false)}) != "" {
		t.Error("cover deshabilitado no deberia emitir nada")
	}
	if CoverCSS(&theme.Cover{Enabled: ptr(true), Break: ptr("none")}) != "" {
		t.Error("break none no deberia cortar pagina")
	}
	got := CoverCSS(&theme.Cover{Enabled: ptr(true), Break: ptr("page")})
	if !strings.Contains(got, "."+Wrapper+" > hr:first-of-type") || !strings.Contains(got, "break-after: page") {
		t.Errorf("obtuvo %q", got)
	}
}

func TestTitle(t *testing.T) {
	if got := Title([]byte("texto\n\n# El titulo\n\n# otro"), "x"); got != "El titulo" {
		t.Errorf("obtuvo %q", got)
	}
	if got := Title([]byte("## no es h1"), "porDefecto"); got != "porDefecto" {
		t.Errorf("obtuvo %q", got)
	}
}

func TestHTMLResetDeBody(t *testing.T) {
	// El margen de 8px que el navegador le pone a <body> corria TODO el
	// documento 5.25pt y lo desalineaba del pie. Medido.
	doc := HTML(Doc{Title: "t", Body: []byte("<p>x</p>"), Theme: &theme.Resolved{}})
	if !strings.Contains(string(doc), "html, body { margin: 0; padding: 0; }") {
		t.Error("falta el reset de body")
	}
	if !strings.Contains(string(doc), `<article class="`+Wrapper+`">`) {
		t.Error("falta el envoltorio del contrato de estructura")
	}
}

func TestSplitFrontmatter(t *testing.T) {
	// Los casos son COMPARTIDOS con el cargador de TypeScript del plugin:
	// testdata/conformance/frontmatter.json. La logica vive dos veces y este
	// fixture es la red que evita que derive.
	raw, err := os.ReadFile("../../../testdata/conformance/frontmatter.json")
	if err != nil {
		t.Fatalf("no pude leer los casos: %v", err)
	}
	var casos []struct {
		Name   string            `json:"name"`
		Why    string            `json:"why"`
		In     string            `json:"in"`
		Campos map[string]string `json:"campos"`
		Cuerpo string            `json:"cuerpo"`
	}
	if err := json.Unmarshal(raw, &casos); err != nil {
		t.Fatalf("frontmatter.json invalido: %v", err)
	}
	if len(casos) == 0 {
		t.Fatal("frontmatter.json esta vacio")
	}

	for _, c := range casos {
		t.Run(c.Name, func(t *testing.T) {
			campos, cuerpo := SplitFrontmatter([]byte(c.In))
			if string(cuerpo) != c.Cuerpo {
				t.Errorf("%s | cuerpo: quiere %q, obtuvo %q", c.Why, c.Cuerpo, cuerpo)
			}
			if len(campos) != len(c.Campos) {
				t.Fatalf("%s | campos: quiere %v, obtuvo %v", c.Why, c.Campos, campos)
			}
			for k, v := range c.Campos {
				if campos[k] != v {
					t.Errorf("%s | campo %q: quiere %q, obtuvo %q", c.Why, k, v, campos[k])
				}
			}
		})
	}
}

func TestTitleFrom(t *testing.T) {
	if got := TitleFrom(map[string]string{"title": "Del frontmatter"}, []byte("# Del h1"), "x"); got != "Del frontmatter" {
		t.Errorf("obtuvo %q", got)
	}
	if got := TitleFrom(nil, []byte("# Del h1"), "x"); got != "Del h1" {
		t.Errorf("obtuvo %q", got)
	}
	if got := TitleFrom(nil, []byte("sin titulo"), "del archivo"); got != "del archivo" {
		t.Errorf("obtuvo %q", got)
	}
}

func TestMergeVars(t *testing.T) {
	vars := map[string]theme.Localized{"a": {Plano: "1"}}
	out := MergeVars(vars, map[string]string{"sistema": "PGW"}, "es")
	if out["a"] != "1" || out["fm.sistema"] != "PGW" {
		t.Errorf("obtuvo %v", out)
	}
	if got := MergeVars(vars, nil, "es"); got["a"] != "1" {
		t.Errorf("obtuvo %v", got)
	}
}

// La banda tiene que resolver el idioma, no imprimir el objeto crudo.
func TestBandHTMLLocalizada(t *testing.T) {
	b := &theme.Band{
		Enabled: ptr(true),
		Right:   &theme.Localized{Por: map[string]string{"en": "Page {{page}}", "es": "Pagina {{page}}"}},
	}
	for locale, quiere := range map[string]string{"es": "Pagina", "en": "Page", "ja": "Page", "es-419": "Pagina"} {
		got := BandHTML(b, nil, nil, "", locale)
		if !strings.Contains(got, quiere) {
			t.Errorf("locale %q: quiere %q en\n%s", locale, quiere, got)
		}
	}
}
