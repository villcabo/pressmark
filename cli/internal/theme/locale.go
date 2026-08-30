package theme

import (
	"encoding/json"
	"sort"
	"strings"
)

// Localized is user-facing text: a plain string, or a per-language object. A
// plain string applies to every language.
type Localized struct {
	Plain  string
	ByLang map[string]string
}

func (l *Localized) UnmarshalJSON(b []byte) error {
	if len(b) > 0 && b[0] == '"' {
		return json.Unmarshal(b, &l.Plain)
	}
	return json.Unmarshal(b, &l.ByLang)
}

func (l Localized) MarshalJSON() ([]byte, error) {
	if l.ByLang != nil {
		return json.Marshal(l.ByLang)
	}
	return json.Marshal(l.Plain)
}

// Resolve picks the text for a language.
//
// The fallback chain, in order:
//
//  1. exact match                (pt-BR asks for pt-BR)
//  2. the request's base language (pt-BR falls back to pt)
//  3. any variant of that language, the FIRST in alphabetical order
//     (pt finds pt-BR)
//  4. en
//  5. any variant of en
//  6. the first key in alphabetical order
//
// The alphabetical order isn't arbitrary: Go maps iterate randomly, and
// without a stable criterion the same theme would give different text
// between runs and between the two implementations.
func (l Localized) Resolve(locale string) string {
	if l.ByLang == nil {
		return l.Plain
	}
	if len(l.ByLang) == 0 {
		return ""
	}

	locale = strings.TrimSpace(locale)
	if locale == "" {
		locale = "en"
	}

	if v, ok := l.ByLang[locale]; ok {
		return v
	}

	keys := make([]string, 0, len(l.ByLang))
	for k := range l.ByLang {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	base := func(s string) string {
		if i := strings.IndexByte(s, '-'); i > 0 {
			return s[:i]
		}
		return s
	}

	for _, cand := range []string{base(locale), "en"} {
		if v, ok := l.ByLang[cand]; ok {
			return v
		}
		for _, k := range keys {
			if base(k) == cand {
				return l.ByLang[k]
			}
		}
	}
	return l.ByLang[keys[0]]
}

// String makes the unresolved value usable for logs and errors.
func (l Localized) String() string { return l.Resolve("en") }
