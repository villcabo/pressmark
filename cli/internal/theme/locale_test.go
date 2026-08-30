package theme

import (
	"encoding/json"
	"os"
	"testing"
)

// The cases are SHARED with the plugin's TypeScript loader:
// testdata/conformance/locale.json
func TestLocalizedResolve(t *testing.T) {
	raw, err := os.ReadFile("../../../testdata/conformance/locale.json")
	if err != nil {
		t.Fatalf("could not read the cases: %v", err)
	}
	var cases []struct {
		Name   string          `json:"name"`
		Why    string          `json:"why"`
		Value  json.RawMessage `json:"value"`
		Locale string          `json:"locale"`
		Want   string          `json:"want"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("invalid locale.json: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("locale.json is empty")
	}

	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			var l Localized
			if err := json.Unmarshal(c.Value, &l); err != nil {
				t.Fatalf("invalid value: %v", err)
			}
			if got := l.Resolve(c.Locale); got != c.Want {
				t.Errorf("%s | want %q, got %q", c.Why, c.Want, got)
			}
		})
	}
}

func TestLocalizedRoundTrip(t *testing.T) {
	// A resolved theme has to be a valid theme.json again: the plugin saves
	// the user's customizations by re-serializing it.
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
			t.Errorf("round-trip: want %s, got %s", in, out)
		}
	}
}
