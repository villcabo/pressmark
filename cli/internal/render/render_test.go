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
	cases := []struct {
		in      string
		quiere  float64
		wantErr bool
	}{
		{"25.4mm", 1, false},
		{"2.54cm", 1, false},
		{"1in", 1, false},
		{"72pt", 1, false},
		{"96px", 1, false},
		{"96", 1, false}, // bare number = px
		{" 18mm ", 18 / 25.4, false},
		{"18MM", 18 / 25.4, false},
		{"", 0, true},
		{"18 inches", 0, true},
		{"abcmm", 0, true},
	}
	for _, c := range cases {
		got, err := ToInches(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("ToInches(%q): expected an error, got %v", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("ToInches(%q): %v", c.in, err)
			continue
		}
		if math.Abs(got-c.quiere) > 1e-9 {
			t.Errorf("ToInches(%q) = %v, want %v", c.in, got, c.quiere)
		}
	}
}

func TestPaperSize(t *testing.T) {
	w, h, err := PaperSize("a4")
	if err != nil || w != 8.27 || h != 11.69 {
		t.Errorf("A4 = %v x %v (%v)", w, h, err)
	}
	if _, _, err := PaperSize("A9"); err == nil {
		t.Error("A9 should fail")
	}
}

func TestTokensCSSIsStable(t *testing.T) {
	tokens := map[string]theme.Value{"zeta": "1", "alfa": "2", "media": "3"}
	// The same map twice has to produce the same text: Go maps iterate in
	// random order and the golden corpus compares byte for byte.
	a, b := TokensCSS(tokens), TokensCSS(tokens)
	if a != b {
		t.Fatal("TokensCSS is not stable across calls")
	}
	if !strings.Contains(a, "--alfa: 2;") {
		t.Errorf("missing the alfa token:\n%s", a)
	}
	if strings.Index(a, "--alfa") > strings.Index(a, "--zeta") {
		t.Error("tokens did not come out sorted")
	}
	if TokensCSS(nil) != "" {
		t.Error("with no tokens it should not emit :root")
	}
}

func ptr[T any](v T) *T { return &v }

// loc builds a localizable text from a plain string.
func loc(v string) *theme.Localized { return &theme.Localized{Plain: v} }

func TestBandHTML(t *testing.T) {
	m := &theme.Margin{Left: ptr("19mm"), Right: ptr("21mm")}
	vars := map[string]string{"notice": "Confidential & internal"}
	const es = "es"

	t.Run("disabled returns an empty span", func(t *testing.T) {
		if got := BandHTML(nil, m, vars, "T", es); got != "<span></span>" {
			t.Errorf("got %q", got)
		}
		if got := BandHTML(&theme.Band{Enabled: ptr(false)}, m, vars, "T", es); got != "<span></span>" {
			t.Errorf("got %q", got)
		}
	})

	t.Run("injects the theme's margin", func(t *testing.T) {
		b := &theme.Band{Enabled: ptr(true), Left: loc("{{vars.notice}}"), Right: loc("{{page}}/{{pages}}")}
		got := BandHTML(b, m, vars, "T", es)
		// This is the whole point: the padding comes from page.margin, not
		// hand-written. In the old format it ended up 1mm off from the body.
		if !strings.Contains(got, "padding:0 21mm 0 19mm") {
			t.Errorf("did not inject the margin:\n%s", got)
		}
		if !strings.Contains(got, `<span class="pageNumber"></span>`) {
			t.Errorf("did not expand {{page}}:\n%s", got)
		}
		if !strings.Contains(got, `<span class="totalPages"></span>`) {
			t.Errorf("did not expand {{pages}}:\n%s", got)
		}
		if !strings.Contains(got, "Confidential &amp; internal") {
			t.Errorf("did not escape the var:\n%s", got)
		}
		if strings.Count(got, "<span>") != 3 {
			t.Errorf("there should always be 3 slots, so flex doesn't decenter:\n%s", got)
		}
	})

	t.Run("no margin doesn't blow up", func(t *testing.T) {
		b := &theme.Band{Enabled: ptr(true), Center: loc("x")}
		if got := BandHTML(b, nil, nil, "", es); !strings.Contains(got, "padding:0 0 0 0") {
			t.Errorf("got %q", got)
		}
	})
}

func TestCoverCSS(t *testing.T) {
	if CoverCSS(nil) != "" {
		t.Error("with no cover it should not emit anything")
	}
	if CoverCSS(&theme.Cover{Enabled: ptr(false)}) != "" {
		t.Error("disabled cover should not emit anything")
	}
	if CoverCSS(&theme.Cover{Enabled: ptr(true), Break: ptr("none")}) != "" {
		t.Error("break none should not force a page break")
	}
	got := CoverCSS(&theme.Cover{Enabled: ptr(true), Break: ptr("page")})
	if !strings.Contains(got, "."+Wrapper+" > hr:first-of-type") || !strings.Contains(got, "page-break-after: always") {
		t.Errorf("got %q", got)
	}
}

func TestTitle(t *testing.T) {
	if got := Title([]byte("text\n\n# The title\n\n# another"), "x"); got != "The title" {
		t.Errorf("got %q", got)
	}
	if got := Title([]byte("## not an h1"), "fallback"); got != "fallback" {
		t.Errorf("got %q", got)
	}
}

func TestHTMLBodyReset(t *testing.T) {
	// The 8px margin browsers put on <body> shifted the WHOLE document by
	// 5.25pt and misaligned it against the footer. Measured.
	doc := HTML(Doc{Title: "t", Body: []byte("<p>x</p>"), Theme: &theme.Resolved{}})
	if !strings.Contains(string(doc), "html, body { margin: 0; padding: 0; }") {
		t.Error("missing the body reset")
	}
	if !strings.Contains(string(doc), `<article class="`+Wrapper+`">`) {
		t.Error("missing the structure contract wrapper")
	}
}

func TestSplitFrontmatter(t *testing.T) {
	// The cases are SHARED with the plugin's TypeScript loader:
	// testdata/conformance/frontmatter.json. The logic lives in two places
	// and this fixture is the safety net that keeps them from drifting apart.
	raw, err := os.ReadFile("../../../testdata/conformance/frontmatter.json")
	if err != nil {
		t.Fatalf("could not read the cases: %v", err)
	}
	var cases []struct {
		Name   string            `json:"name"`
		Why    string            `json:"why"`
		In     string            `json:"in"`
		Fields map[string]string `json:"fields"`
		Body   string            `json:"body"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("invalid frontmatter.json: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("frontmatter.json is empty")
	}

	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			fields, body := SplitFrontmatter([]byte(c.In))
			if string(body) != c.Body {
				t.Errorf("%s | body: want %q, got %q", c.Why, c.Body, body)
			}
			if len(fields) != len(c.Fields) {
				t.Fatalf("%s | fields: want %v, got %v", c.Why, c.Fields, fields)
			}
			for k, v := range c.Fields {
				if fields[k] != v {
					t.Errorf("%s | field %q: want %q, got %q", c.Why, k, v, fields[k])
				}
			}
		})
	}
}

func TestTitleFrom(t *testing.T) {
	if got := TitleFrom(map[string]string{"title": "From the frontmatter"}, []byte("# From the h1"), "x"); got != "From the frontmatter" {
		t.Errorf("got %q", got)
	}
	if got := TitleFrom(nil, []byte("# From the h1"), "x"); got != "From the h1" {
		t.Errorf("got %q", got)
	}
	if got := TitleFrom(nil, []byte("no title"), "from the file"); got != "from the file" {
		t.Errorf("got %q", got)
	}
}

func TestMergeVars(t *testing.T) {
	vars := map[string]theme.Localized{"a": {Plain: "1"}}
	out := MergeVars(vars, map[string]string{"sistema": "PGW"}, "es")
	if out["a"] != "1" || out["fm.sistema"] != "PGW" {
		t.Errorf("got %v", out)
	}
	if got := MergeVars(vars, nil, "es"); got["a"] != "1" {
		t.Errorf("got %v", got)
	}
}

// The band has to resolve the locale, not print the raw object.
func TestBandHTMLLocalized(t *testing.T) {
	b := &theme.Band{
		Enabled: ptr(true),
		Right:   &theme.Localized{ByLang: map[string]string{"en": "Page {{page}}", "es": "Pagina {{page}}"}},
	}
	for locale, want := range map[string]string{"es": "Pagina", "en": "Page", "ja": "Page", "es-419": "Pagina"} {
		got := BandHTML(b, nil, nil, "", locale)
		if !strings.Contains(got, want) {
			t.Errorf("locale %q: want %q in\n%s", locale, want, got)
		}
	}
}
