package render

import (
	"fmt"
	"strconv"
	"strings"
)

// ToInches convierte una longitud CSS a pulgadas, que es lo que espera
// Page.printToPDF. Acepta mm, cm, in, pt, px y numero pelado (se asume px).
func ToInches(v string) (float64, error) {
	v = strings.TrimSpace(strings.ToLower(v))
	if v == "" {
		return 0, fmt.Errorf("longitud vacia")
	}
	for _, u := range []struct {
		suf   string
		porIn float64
	}{
		{"mm", 25.4}, {"cm", 2.54}, {"in", 1}, {"pt", 72}, {"px", 96},
	} {
		if strings.HasSuffix(v, u.suf) {
			n, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(v, u.suf)), 64)
			if err != nil {
				return 0, fmt.Errorf("longitud %q: %w", v, err)
			}
			return n / u.porIn, nil
		}
	}
	n, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0, fmt.Errorf("longitud %q: no reconozco la unidad", v)
	}
	return n / 96, nil
}

// Papel en pulgadas. printToPDF no entiende nombres, solo medidas.
var papeles = map[string][2]float64{
	"a3":      {11.69, 16.54},
	"a4":      {8.27, 11.69},
	"a5":      {5.83, 8.27},
	"letter":  {8.5, 11},
	"legal":   {8.5, 14},
	"tabloid": {11, 17},
}

func PaperSize(name string) (w, h float64, err error) {
	d, ok := papeles[strings.ToLower(strings.TrimSpace(name))]
	if !ok {
		return 0, 0, fmt.Errorf("tamano de papel desconocido: %q", name)
	}
	return d[0], d[1], nil
}
