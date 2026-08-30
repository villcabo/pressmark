package theme

import (
	"encoding/json"
	"os"
	"testing"
)

// Los casos son COMPARTIDOS con el cargador de TypeScript del plugin:
// testdata/conformance/locale.json
func TestLocalizedResolve(t *testing.T) {
	raw, err := os.ReadFile("../../../testdata/conformance/locale.json")
	if err != nil {
		t.Fatalf("no pude leer los casos: %v", err)
	}
	var casos []struct {
		Name   string          `json:"name"`
		Why    string          `json:"why"`
		Valor  json.RawMessage `json:"valor"`
		Locale string          `json:"locale"`
		Quiere string          `json:"quiere"`
	}
	if err := json.Unmarshal(raw, &casos); err != nil {
		t.Fatalf("locale.json invalido: %v", err)
	}
	if len(casos) == 0 {
		t.Fatal("locale.json esta vacio")
	}

	for _, c := range casos {
		t.Run(c.Name, func(t *testing.T) {
			var l Localized
			if err := json.Unmarshal(c.Valor, &l); err != nil {
				t.Fatalf("valor invalido: %v", err)
			}
			if got := l.Resolve(c.Locale); got != c.Quiere {
				t.Errorf("%s | quiere %q, obtuvo %q", c.Why, c.Quiere, got)
			}
		})
	}
}

func TestLocalizedRoundTrip(t *testing.T) {
	// Un theme resuelto tiene que volver a ser un theme.json valido: el plugin
	// guarda las personalizaciones del usuario reserializando.
	for _, in := range []string{`"suelto"`, `{"en":"Report","es":"Informe"}`} {
		var l Localized
		if err := json.Unmarshal([]byte(in), &l); err != nil {
			t.Fatal(err)
		}
		out, err := json.Marshal(l)
		if err != nil {
			t.Fatal(err)
		}
		if string(out) != in {
			t.Errorf("round-trip: quiere %s, obtuvo %s", in, out)
		}
	}
}
