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

	"github.com/villcabo/pressmark/cli/internal/theme"
)

// These cases are ALSO run by the plugin's TypeScript loader. They live in
// testdata/conformance/cases.json, outside the Go module, precisely so they
// aren't just "Go's tests": they are the contract.
const casesPath = "../../../testdata/conformance/cases.json"

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

func TestConformance(t *testing.T) {
	raw, err := os.ReadFile(casesPath)
	if err != nil {
		t.Fatalf("could not read the cases: %v", err)
	}
	var cases []caso
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("invalid cases.json: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("cases.json is empty")
	}

	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			fsys := fstest.MapFS{}
			for id, p := range c.Packs {
				fsys[id+"/theme.json"] = &fstest.MapFile{Data: p.JSON}
				fsys[id+"/theme.css"] = &fstest.MapFile{Data: []byte(p.CSS)}
			}

			got, err := theme.Load(fsys, c.Load)

			if c.ExpectError != "" {
				if err == nil {
					t.Fatalf("%s\n  expected an error mentioning %q, resolved without error", c.Why, c.ExpectError)
				}
				if !strings.Contains(err.Error(), c.ExpectError) {
					t.Fatalf("%s\n  the error doesn't mention %q: %v", c.Why, c.ExpectError, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("%s\n  %v", c.Why, err)
			}
			compare(t, c.Why, c.Expect, got)
		})
	}
}

var whitespace = regexp.MustCompile(`\s+`)

// compare checks ONLY the keys present in expect. Everything else is
// deliberately ignored: a case declares the rule it cares about, not the
// whole object.
func compare(t *testing.T, why string, expect json.RawMessage, got *theme.Resolved) {
	t.Helper()

	var expected map[string]any
	if err := json.Unmarshal(expect, &expected); err != nil {
		t.Fatalf("invalid expect: %v", err)
	}

	// The CSS is compared with whitespace normalized: each implementation
	// builds its separator comments its own way and that isn't part of the
	// contract.
	if v, ok := expected["css"]; ok {
		delete(expected, "css")
		q := whitespace.ReplaceAllString(strings.TrimSpace(v.(string)), " ")
		g := whitespace.ReplaceAllString(strings.TrimSpace(stripSeparatorComments(got.CSS)), " ")
		if q != g {
			t.Errorf("%s\n  css:\n    want %q\n    got %q", why, q, g)
		}
	}
	if v, ok := expected["chain"]; ok {
		delete(expected, "chain")
		var q []string
		for _, x := range v.([]any) {
			q = append(q, x.(string))
		}
		if !reflect.DeepEqual(q, got.Chain) {
			t.Errorf("%s\n  chain: want %v, got %v", why, q, got.Chain)
		}
	}

	// The rest is compared by serializing the resolved theme: that way the
	// test doesn't depend on how the pointers are modeled internally.
	raw, err := json.Marshal(got.Theme)
	if err != nil {
		t.Fatal(err)
	}
	var actual map[string]any
	if err := json.Unmarshal(raw, &actual); err != nil {
		t.Fatal(err)
	}
	for k, q := range expected {
		g, present := actual[k]
		if !present {
			t.Errorf("%s\n  missing key %q in the result", why, k)
			continue
		}
		if !partial(q, g) {
			t.Errorf("%s\n  %s:\n    want %s\n    got %s", why, k, jsonStr(q), jsonStr(g))
		}
	}
}

// partial: for objects it compares only q's keys; for everything else, equality.
func partial(q, g any) bool {
	qm, qok := q.(map[string]any)
	gm, gok := g.(map[string]any)
	if qok && gok {
		for k, v := range qm {
			gv, ok := gm[k]
			if !ok || !partial(v, gv) {
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

// stripSeparatorComments removes the "/* ── id ── */" the Go loader
// interleaves.
func stripSeparatorComments(css string) string {
	re := regexp.MustCompile(`/\* ── [^─]* ── \*/`)
	return re.ReplaceAllString(css, " ")
}

func ExampleLoad() {
	fsys := fstest.MapFS{
		"_base/theme.json": &fstest.MapFile{Data: []byte(`{"id":"_base","name":"B","version":"1.0.0","extends":null,"tokens":{"accent":"#111"}}`)},
		"_base/theme.css":  &fstest.MapFile{Data: []byte("a{}")},
	}
	t, _ := theme.Load(fsys, "_base")
	fmt.Println(t.Tokens["accent"])
	// Output: #111
}
