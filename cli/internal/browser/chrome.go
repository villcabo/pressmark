// Package browser maneja Chrome por CDP. No hay Puppeteer, no hay Node: solo
// el Chrome que ya esta instalado en la maquina.
package browser

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
)

type PDFOptions struct {
	PaperWidth   float64 // pulgadas
	PaperHeight  float64
	MarginTop    float64
	MarginRight  float64
	MarginBottom float64
	MarginLeft   float64
	Background   bool
	Scale        float64
	Header       string
	Footer       string
	ShowBands    bool
	Landscape    bool
}

type Chrome struct {
	alloc  context.CancelFunc
	ctx    context.Context
	cancel context.CancelFunc
}

// New levanta Chrome una sola vez. Convertir 20 archivos no deberia levantar 20
// navegadores: por eso la instancia se reusa.
func New(ctx context.Context, execPath string) (*Chrome, error) {
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.NoSandbox,
		chromedp.DisableGPU,
		chromedp.Flag("hide-scrollbars", true),
		chromedp.Flag("disable-extensions", true),
	)
	if execPath != "" {
		opts = append(opts, chromedp.ExecPath(execPath))
	}
	allocCtx, allocCancel := chromedp.NewExecAllocator(ctx, opts...)
	taskCtx, taskCancel := chromedp.NewContext(allocCtx)

	if err := chromedp.Run(taskCtx); err != nil {
		taskCancel()
		allocCancel()
		return nil, fmt.Errorf("no pude levantar Chrome: %w", err)
	}
	return &Chrome{alloc: allocCancel, ctx: taskCtx, cancel: taskCancel}, nil
}

func (c *Chrome) Close() {
	c.cancel()
	c.alloc()
}

// PDF carga el HTML y lo imprime.
//
// El HTML se escribe a un archivo temporal AL LADO del .md de origen y se carga
// con file://. Suena rebuscado y no lo es: es lo unico que hace que las rutas
// relativas de las imagenes resuelvan como el autor las escribio.
func (c *Chrome) PDF(htmlDoc []byte, baseDir string, opts PDFOptions, prep ...Prep) ([]byte, error) {
	tmp, err := os.CreateTemp(baseDir, ".md2topdf-*.html")
	if err != nil {
		return nil, fmt.Errorf("no pude crear el temporal en %s: %w", baseDir, err)
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(htmlDoc); err != nil {
		tmp.Close()
		return nil, err
	}
	tmp.Close()

	abs, err := filepath.Abs(tmp.Name())
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(c.ctx, 90*time.Second)
	defer cancel()

	acciones := []chromedp.Action{
		chromedp.Navigate("file://" + abs),
		chromedp.WaitReady("body", chromedp.ByQuery),
		// Sin esto, un tipo aun sin cargar imprime con la fuente de reemplazo
		// y el documento sale con otra metrica.
		AwaitJS(`document.fonts.ready`),
	}
	for _, p := range prep {
		acciones = append(acciones, p(&opts))
	}

	var pdf []byte
	acciones = append(acciones, chromedp.ActionFunc(func(ctx context.Context) error {
		p := page.PrintToPDF().
			WithPrintBackground(opts.Background).
			WithPaperWidth(opts.PaperWidth).
			WithPaperHeight(opts.PaperHeight).
			WithMarginTop(opts.MarginTop).
			WithMarginRight(opts.MarginRight).
			WithMarginBottom(opts.MarginBottom).
			WithMarginLeft(opts.MarginLeft).
			WithLandscape(opts.Landscape).
			// Falso a proposito: el tamano lo manda theme.json, no un @page
			// que se le haya colado al CSS. Fuente unica de verdad.
			WithPreferCSSPageSize(false).
			WithDisplayHeaderFooter(opts.ShowBands)
		if opts.ShowBands {
			p = p.WithHeaderTemplate(opts.Header).WithFooterTemplate(opts.Footer)
		}
		if opts.Scale > 0 {
			p = p.WithScale(opts.Scale)
		}
		var err error
		pdf, _, err = p.Do(ctx)
		return err
	}))

	if err := chromedp.Run(ctx, acciones...); err != nil {
		return nil, err
	}
	return pdf, nil
}

// Prep es un paso que corre con la pagina cargada y ANTES de imprimir.
// Ahi entra mermaid: se espera a que su render asincrono resuelva.
type Prep func(*PDFOptions) chromedp.Action

// AwaitJS evalua una expresion y ESPERA a que su promesa resuelva.
//
// Esta es la pieza que hace innecesario a mmdc. El script viejo pre-renderizaba
// los diagramas con un binario aparte porque "Puppeteer imprime sin esperar el
// render asincrono de mermaid". Eso era cierto del pipeline cerrado de
// md-to-pdf, no de CDP: manejando Chrome uno mismo se pide awaitPromise y no
// hay carrera que perder.
func AwaitJS(expr string) chromedp.Action {
	return chromedp.Evaluate(expr, nil, func(p *runtime.EvaluateParams) *runtime.EvaluateParams {
		return p.WithAwaitPromise(true)
	})
}

// BandOrEmpty: Chrome revienta con un template vacio, hay que darle algo.
func BandOrEmpty(s string) string {
	if strings.TrimSpace(s) == "" {
		return "<span></span>"
	}
	return s
}
