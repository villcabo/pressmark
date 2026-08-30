package theme_test

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/villcabo/md2topdf/cli/internal/theme"
)

// Estos casos los corren TAMBIEN el cargador de TypeScript del plugin. Viven en
// testdata/conformance/cases.json, fuera del modulo de Go, justamente para que
// no sean "los tests de Go": son el contrato.
const casosPath = "../../../testdata/conformance/cases.json"

type caso struct {
	Name  string `json:"name"`
	Why   string `json:"why"`
	Packs map[string]struct {
		JSON json.RawMessage `json:"json"`
		CSS  string          `json:"css"`
	} `json:"packs"`
	Load        string          `json:"load"`
	Expect      json.RawMessage `json:"expect"`
	ExpectError string          `json:"expectError"`
}

func TestConformidad(t *testing.T) {
	raw, err := os.ReadFile(casosPath)
	if err != nil {
		t.Fatalf("no pude leer los casos: %v", err)
	}
	var casos []caso
	if err := json.Unmarshal(raw, &casos); err != nil {
		t.Fatalf("cases.json invalido: %v", err)
	}
	if len(casos) == 0 {
		t.Fatal("cases.json esta vacio")
	}

	for _, c := range casos {
		t.Run(c.Name, func(t *testing.T) {
			fsys := fstest.MapFS{}
			for id, p := range c.Packs {
				fsys[id+"/theme.json"] = &fstest.MapFile{Data: p.JSON}
				fsys[id+"/theme.css"] = &fstest.MapFile{Data: []byte(p.CSS)}
			}

			got, err := theme.Load(fsys, c.Load)

			if c.ExpectError != "" {
				if err == nil {
					t.Fatalf("%s\n  esperaba error con %q, resolvio sin error", c.Why, c.ExpectError)
				}
				if !strings.Contains(err.Error(), c.ExpectError) {
					t.Fatalf("%s\n  el error no menciona %q: %v", c.Why, c.ExpectError, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("%s\n  %v", c.Why, err)
			}
			comparar(t, c.Why, c.Expect, got)
		})
	}
}

var espacios = regexp.MustCompile(`\s+`)

// comparar verifica SOLO las claves presentes en expect. El resto se ignora a
// proposito: un caso declara la regla que le importa, no el objeto entero.
func comparar(t *testing.T, why string, expect json.RawMessage, got *theme.Resolved) {
	t.Helper()

	var esperado map[string]any
	if err := json.Unmarshal(expect, &esperado); err != nil {
		t.Fatalf("expect invalido: %v", err)
	}

	// El CSS se compara normalizando espacios: cada implementacion arma sus
	// comentarios separadores a su manera y eso no es parte del contrato.
	if v, ok := esperado["css"]; ok {
		delete(esperado, "css")
		q := espacios.ReplaceAllString(strings.TrimSpace(v.(string)), " ")
		g := espacios.ReplaceAllString(strings.TrimSpace(sinComentariosSep(got.CSS)), " ")
		if q != g {
			t.Errorf("%s\n  css:\n    quiere %q\n    obtuvo %q", why, q, g)
		}
	}
	if v, ok := esperado["chain"]; ok {
		delete(esperado, "chain")
		var q []string
		for _, x := range v.([]any) {
			q = append(q, x.(string))
		}
		if !reflect.DeepEqual(q, got.Chain) {
			t.Errorf("%s\n  chain: quiere %v, obtuvo %v", why, q, got.Chain)
		}
	}

	// El resto se compara serializando el resuelto: asi el test no depende de
	// como estan modelados los punteros por dentro.
	crudo, err := json.Marshal(got.Theme)
	if err != nil {
		t.Fatal(err)
	}
	var real map[string]any
	if err := json.Unmarshal(crudo, &real); err != nil {
		t.Fatal(err)
	}
	for k, q := range esperado {
		g, presente := real[k]
		if !presente {
			t.Errorf("%s\n  falta la clave %q en el resultado", why, k)
			continue
		}
		if !parcial(q, g) {
			t.Errorf("%s\n  %s:\n    quiere %s\n    obtuvo %s", why, k, jsonStr(q), jsonStr(g))
		}
	}
}

// parcial: para objetos compara solo las claves de q; para el resto, igualdad.
func parcial(q, g any) bool {
	qm, qok := q.(map[string]any)
	gm, gok := g.(map[string]any)
	if qok && gok {
		for k, v := range qm {
			gv, ok := gm[k]
			if !ok || !parcial(v, gv) {
				return false
			}
		}
		return true
	}
	return reflect.DeepEqual(q, g)
}

func jsonStr(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// sinComentariosSep saca los "/* ── id ── */" que el cargador de Go intercala.
func sinComentariosSep(css string) string {
	re := regexp.MustCompile(`/\* ── [^─]* ── \*/`)
	return re.ReplaceAllString(css, " ")
}

func ExampleLoad() {
	fsys := fstest.MapFS{
		"_base/theme.json": &fstest.MapFile{Data: []byte(`{"id":"_base","name":"B","version":"1.0.0","extends":null,"tokens":{"acento":"#111"}}`)},
		"_base/theme.css":  &fstest.MapFile{Data: []byte("a{}")},
	}
	t, _ := theme.Load(fsys, "_base")
	fmt.Println(t.Tokens["acento"])
	// Output: #111
}
