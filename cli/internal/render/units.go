package render

import (
	"fmt"
	"strconv"
	"strings"
)

// ToInches converts a CSS length to inches, which is what Page.printToPDF
// expects. Accepts mm, cm, in, pt, px and a bare number (assumed px).
func ToInches(v string) (float64, error) {
	v = strings.TrimSpace(strings.ToLower(v))
	if v == "" {
		return 0, fmt.Errorf("empty length")
	}
	for _, u := range []struct {
		suf     string
		perInch float64
	}{
		{"mm", 25.4}, {"cm", 2.54}, {"in", 1}, {"pt", 72}, {"px", 96},
	} {
		if strings.HasSuffix(v, u.suf) {
			n, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(v, u.suf)), 64)
			if err != nil {
				return 0, fmt.Errorf("length %q: %w", v, err)
			}
			return n / u.perInch, nil
		}
	}
	n, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0, fmt.Errorf("length %q: unrecognized unit", v)
	}
	return n / 96, nil
}

// Paper sizes in inches. printToPDF doesn't understand names, only measurements.
var papers = map[string][2]float64{
	"a3":      {11.69, 16.54},
	"a4":      {8.27, 11.69},
	"a5":      {5.83, 8.27},
	"letter":  {8.5, 11},
	"legal":   {8.5, 14},
	"tabloid": {11, 17},
}

func PaperSize(name string) (w, h float64, err error) {
	d, ok := papers[strings.ToLower(strings.TrimSpace(name))]
	if !ok {
		return 0, 0, fmt.Errorf("unknown paper size: %q", name)
	}
	return d[0], d[1], nil
}
