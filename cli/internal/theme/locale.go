package theme

import (
	"encoding/json"
	"sort"
	"strings"
)

// Localized es un texto que se le muestra al usuario: una cadena suelta, o un
// objeto por idioma. Una cadena suelta vale para todos los idiomas.
type Localized struct {
	Plano string
	Por   map[string]string
}

func (l *Localized) UnmarshalJSON(b []byte) error {
	if len(b) > 0 && b[0] == '"' {
		return json.Unmarshal(b, &l.Plano)
	}
	return json.Unmarshal(b, &l.Por)
}

func (l Localized) MarshalJSON() ([]byte, error) {
	if l.Por != nil {
		return json.Marshal(l.Por)
	}
	return json.Marshal(l.Plano)
}

// Resolve elige el texto para un idioma.
//
// La cadena de respaldo, en orden:
//
//  1. coincidencia exacta      (pt-BR pide pt-BR)
//  2. el idioma base del pedido (pt-BR cae en pt)
//  3. cualquier variante de ese idioma, la PRIMERA en orden alfabetico
//     (pt encuentra pt-BR)
//  4. en
//  5. cualquier variante de en
//  6. la primera clave en orden alfabetico
//
// El orden alfabetico no es capricho: los mapas de Go iteran al azar, y sin un
// criterio estable el mismo theme daria textos distintos entre corridas y entre
// las dos implementaciones.
func (l Localized) Resolve(locale string) string {
	if l.Por == nil {
		return l.Plano
	}
	if len(l.Por) == 0 {
		return ""
	}

	locale = strings.TrimSpace(locale)
	if locale == "" {
		locale = "en"
	}

	if v, ok := l.Por[locale]; ok {
		return v
	}

	claves := make([]string, 0, len(l.Por))
	for k := range l.Por {
		claves = append(claves, k)
	}
	sort.Strings(claves)

	base := func(s string) string {
		if i := strings.IndexByte(s, '-'); i > 0 {
			return s[:i]
		}
		return s
	}

	for _, cand := range []string{base(locale), "en"} {
		if v, ok := l.Por[cand]; ok {
			return v
		}
		for _, k := range claves {
			if base(k) == cand {
				return l.Por[k]
			}
		}
	}
	return l.Por[claves[0]]
}

// String hace utilizable el valor sin resolver, para logs y errores.
func (l Localized) String() string { return l.Resolve("en") }
