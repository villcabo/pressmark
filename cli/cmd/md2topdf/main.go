// md2topdf convierte Markdown a PDF aplicando un theme pack.
//
// El motor de maquetado es Chrome. Este binario no renderiza: lo maneja por
// CDP. Es una diferencia importante — ningun paquete de Go sabe maquetar CSS
// para impresion, y pretender lo contrario significaria tirar los themes.
package main

import (
	"context"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/chromedp/chromedp"
	"github.com/villcabo/md2topdf/cli/internal/browser"

	"github.com/villcabo/md2topdf/cli/internal/mermaid"
	"github.com/villcabo/md2topdf/cli/internal/render"
	"github.com/villcabo/md2topdf/cli/internal/theme"
	"github.com/villcabo/md2topdf/cli/internal/themes"
)

const uso = `md2topdf — convierte Markdown a PDF con un theme pack

  El PDF se guarda al lado del .md, con el mismo nombre.

USO
  md2topdf <archivo.md | carpeta | *.md> [opciones]

OPCIONES
  -e, --estilo <id>    Theme pack a aplicar (por defecto: informe)
      --carta          Tamano carta (por defecto: el del theme)
      --a4             Fuerza A4
      --margen <mm>    Margen parejo en milimetros, pisa al del theme
      --html           Genera el HTML intermedio en vez del PDF
  -o, --salida <ruta>  Archivo de salida (solo con un archivo de entrada)
      --temas <dir>    Directorio de theme packs propios
      --chrome <ruta>  Ejecutable de Chrome a usar
  -l, --listar         Lista los theme packs disponibles
  -h, --ayuda          Esta ayuda

THEME PACKS
  Se buscan primero en --temas (o ~/.config/md2topdf/themes) y despues entre
  los que vienen dentro del binario. Un theme propio puede heredar de uno
  embebido: extends "_base" funciona aunque _base no este en tu disco.
`

type opciones struct {
	estilo   string
	salida   string
	temasD   string
	chrome   string
	margen   float64
	carta    bool
	a4       bool
	soloHTML bool
	listar   bool
}

func main() {
	if err := ejecutar(); err != nil {
		fmt.Fprintln(os.Stderr, "md2topdf:", err)
		os.Exit(1)
	}
}

func ejecutar() error {
	var o opciones
	fs_ := flag.NewFlagSet("md2topdf", flag.ContinueOnError)
	fs_.SetOutput(os.Stderr)
	fs_.Usage = func() { fmt.Fprint(os.Stderr, uso) }

	fs_.StringVar(&o.estilo, "estilo", "informe", "")
	fs_.StringVar(&o.estilo, "e", "informe", "")
	fs_.StringVar(&o.salida, "salida", "", "")
	fs_.StringVar(&o.salida, "o", "", "")
	fs_.StringVar(&o.temasD, "temas", "", "")
	fs_.StringVar(&o.chrome, "chrome", "", "")
	fs_.Float64Var(&o.margen, "margen", 0, "")
	fs_.BoolVar(&o.carta, "carta", false, "")
	fs_.BoolVar(&o.a4, "a4", false, "")
	fs_.BoolVar(&o.soloHTML, "html", false, "")
	fs_.BoolVar(&o.listar, "listar", false, "")
	fs_.BoolVar(&o.listar, "l", false, "")

	if err := fs_.Parse(reordenar(fs_, os.Args[1:])); err != nil {
		return err
	}

	packs := theme.Overlay(theme.UserDir(o.temasD), themes.FS())

	if o.listar {
		return listar(packs)
	}
	entradas, err := expandir(fs_.Args())
	if err != nil {
		return err
	}
	if len(entradas) == 0 {
		fmt.Fprint(os.Stderr, uso)
		return fmt.Errorf("no me diste ningun archivo .md")
	}
	if o.salida != "" && len(entradas) > 1 {
		return fmt.Errorf("--salida solo vale con un archivo de entrada, y me diste %d", len(entradas))
	}

	t, err := theme.Load(packs, o.estilo)
	if err != nil {
		disponibles, _ := theme.List(packs)
		return fmt.Errorf("%w\n  themes disponibles: %s", err, strings.Join(disponibles, ", "))
	}

	return convertir(entradas, t, o)
}

// reordenar adelanta los flags y manda los archivos al final.
//
// El paquete flag corta el parseo en el primer argumento posicional, asi que
// `md2topdf informe.md --estilo nota` le llega como tres archivos. El script de
// bash que esto reemplaza aceptaba flags en cualquier posicion, y romper esa
// ergonomia solo para no escribir esta funcion no vale la pena.
func reordenar(fset *flag.FlagSet, args []string) []string {
	esBool := func(nombre string) bool {
		f := fset.Lookup(strings.TrimLeft(nombre, "-"))
		if f == nil {
			return false
		}
		b, ok := f.Value.(interface{ IsBoolFlag() bool })
		return ok && b.IsBoolFlag()
	}

	var flags, sueltos []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a == "--" { // todo lo que sigue es archivo, aunque parezca flag
			sueltos = append(sueltos, args[i+1:]...)
			break
		}
		if !strings.HasPrefix(a, "-") || a == "-" {
			sueltos = append(sueltos, a)
			continue
		}
		flags = append(flags, a)
		// --flag=valor ya trae el valor pegado; --flag valor se lo lleva del siguiente
		if !strings.Contains(a, "=") && !esBool(a) && i+1 < len(args) {
			i++
			flags = append(flags, args[i])
		}
	}
	return append(flags, sueltos...)
}

func listar(packs fs.FS) error {
	ids, err := theme.List(packs)
	if err != nil {
		return err
	}
	sort.Strings(ids)
	for _, id := range ids {
		t, err := theme.Load(packs, id)
		if err != nil {
			fmt.Printf("  %-12s (no carga: %v)\n", id, err)
			continue
		}
		portada := "sin portada"
		if t.Cover != nil && t.Cover.Enabled != nil && *t.Cover.Enabled {
			portada = "con portada"
		}
		fmt.Printf("  %-12s %-13s %s\n", id, portada, t.Description)
	}
	return nil
}

func expandir(args []string) ([]string, error) {
	var out []string
	for _, a := range args {
		st, err := os.Stat(a)
		if err != nil {
			return nil, fmt.Errorf("no existe %q", a)
		}
		if !st.IsDir() {
			out = append(out, a)
			continue
		}
		e, err := os.ReadDir(a)
		if err != nil {
			return nil, err
		}
		for _, f := range e {
			if !f.IsDir() && strings.EqualFold(filepath.Ext(f.Name()), ".md") {
				out = append(out, filepath.Join(a, f.Name()))
			}
		}
	}
	sort.Strings(out)
	return out, nil
}

func convertir(entradas []string, t *theme.Resolved, o opciones) error {
	opts, err := pdfOptions(t, o)
	if err != nil {
		return err
	}

	var chrome *browser.Chrome
	if !o.soloHTML {
		// Un solo Chrome para todos los archivos, no uno por archivo.
		chrome, err = browser.New(context.Background(), o.chrome)
		if err != nil {
			return err
		}
		defer chrome.Close()
	}

	for _, in := range entradas {
		src, err := os.ReadFile(in)
		if err != nil {
			return err
		}
		titulo := render.Title(src, strings.TrimSuffix(filepath.Base(in), filepath.Ext(in)))

		// Los diagramas se sacan ANTES del resaltador: si pasan por chroma
		// vuelven llenos de <span> y mermaid ya no los parsea.
		src, hayDiagramas := mermaid.Extract(src)

		hl := ""
		if t.Highlight != nil {
			hl = *t.Highlight
		}
		body, err := render.Markdown(src, hl)
		if err != nil {
			return fmt.Errorf("%s: %w", in, err)
		}
		rdoc := render.Doc{Title: titulo, Body: body, Theme: t}
		if hayDiagramas && !o.soloHTML {
			rdoc.ScriptJS = mermaid.LibJS()
		}
		doc := render.HTML(rdoc)

		ext, datos := ".pdf", []byte(nil)
		if o.soloHTML {
			ext, datos = ".html", doc
		} else {
			op := opts
			op.Header = browser.BandOrEmpty(render.BandHTML(t.Header, marginOf(t), t.Vars, titulo))
			op.Footer = browser.BandOrEmpty(render.BandHTML(t.Footer, marginOf(t), t.Vars, titulo))
			op.ShowBands = enabled(t.Header) || enabled(t.Footer)
			var pasos []browser.Prep
			if hayDiagramas {
				pasos = append(pasos, func(*browser.PDFOptions) chromedp.Action {
					return browser.AwaitJS(mermaid.InitJS(
						tok(t, "acento", "#1e4d3b"),
						tok(t, "acento-tenue", "#f2f7f4"),
						tok(t, "tinta", "#16222b")))
				})
			}
			datos, err = chrome.PDF(doc, filepath.Dir(in), op, pasos...)
			if err != nil {
				return fmt.Errorf("%s: %w", in, err)
			}
		}

		out := o.salida
		if out == "" {
			out = strings.TrimSuffix(in, filepath.Ext(in)) + ext
		}
		if err := os.WriteFile(out, datos, 0o644); err != nil {
			return err
		}
		st, _ := os.Stat(out)
		fmt.Printf("✓ %s  (%.0f KB)\n", out, float64(st.Size())/1024)
	}
	return nil
}

// tok lee un design token del theme resuelto. Los diagramas toman la paleta del
// documento: si no, el flowchart desentona con todo lo que lo rodea.
func tok(t *theme.Resolved, nombre, porDefecto string) string {
	if v, ok := t.Tokens[nombre]; ok && v != "" {
		return string(v)
	}
	return porDefecto
}

func enabled(b *theme.Band) bool {
	return b != nil && b.Enabled != nil && *b.Enabled
}

func marginOf(t *theme.Resolved) *theme.Margin {
	if t.Page == nil {
		return nil
	}
	return t.Page.Margin
}

func pdfOptions(t *theme.Resolved, o opciones) (browser.PDFOptions, error) {
	var out browser.PDFOptions
	out.Background = true

	nombre := "A4"
	if t.Page != nil && t.Page.Size != nil {
		if t.Page.Size.Name != "" {
			nombre = t.Page.Size.Name
		} else {
			w, err := render.ToInches(t.Page.Size.Width)
			if err != nil {
				return out, err
			}
			h, err := render.ToInches(t.Page.Size.Height)
			if err != nil {
				return out, err
			}
			out.PaperWidth, out.PaperHeight = w, h
		}
	}
	switch {
	case o.carta:
		nombre = "Letter"
	case o.a4:
		nombre = "A4"
	}
	if out.PaperWidth == 0 {
		w, h, err := render.PaperSize(nombre)
		if err != nil {
			return out, err
		}
		out.PaperWidth, out.PaperHeight = w, h
	}

	if t.Page != nil {
		if t.Page.PrintBackground != nil {
			out.Background = *t.Page.PrintBackground
		}
		if t.Page.Scale != nil {
			out.Scale = *t.Page.Scale
		}
		if t.Page.Orientation != nil && *t.Page.Orientation == "landscape" {
			out.Landscape = true
		}
	}

	var m theme.Margin
	if t.Page != nil && t.Page.Margin != nil {
		m = *t.Page.Margin
	}
	for _, l := range []struct {
		src *string
		dst *float64
	}{
		{m.Top, &out.MarginTop},
		{m.Right, &out.MarginRight},
		{m.Bottom, &out.MarginBottom},
		{m.Left, &out.MarginLeft},
	} {
		if l.src == nil {
			continue
		}
		in, err := render.ToInches(*l.src)
		if err != nil {
			return out, err
		}
		*l.dst = in
	}

	if o.margen > 0 {
		in := o.margen / 25.4
		out.MarginTop, out.MarginRight, out.MarginBottom, out.MarginLeft = in, in, in, in
	}
	return out, nil
}
