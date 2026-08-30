// Package browser drives Chrome over CDP. There is no Puppeteer, no Node:
// just the Chrome already installed on the machine.
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
	PaperWidth   float64 // inches
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

// New starts Chrome exactly once. Converting 20 files should not start 20
// browsers: that's why the instance is reused.
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
		return nil, fmt.Errorf("could not start Chrome: %w", err)
	}
	return &Chrome{alloc: allocCancel, ctx: taskCtx, cancel: taskCancel}, nil
}

func (c *Chrome) Close() {
	c.cancel()
	c.alloc()
}

// PDF loads the HTML and prints it.
//
// The HTML is written to a temp file NEXT TO the source .md and loaded with
// file://. It sounds convoluted and it isn't: it's the only thing that makes
// relative image paths resolve the way the author wrote them.
func (c *Chrome) PDF(htmlDoc []byte, baseDir string, opts PDFOptions, prep ...Prep) ([]byte, error) {
	tmp, err := os.CreateTemp(baseDir, ".pressmark-*.html")
	if err != nil {
		return nil, fmt.Errorf("could not create the temp file in %s: %w", baseDir, err)
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

	actions := []chromedp.Action{
		chromedp.Navigate("file://" + abs),
		chromedp.WaitReady("body", chromedp.ByQuery),
		// Without this, a typeface still loading prints with the fallback font
		// and the document comes out with different metrics.
		AwaitJS(`document.fonts.ready`),
	}
	for _, p := range prep {
		actions = append(actions, p(&opts))
	}

	var pdf []byte
	actions = append(actions, chromedp.ActionFunc(func(ctx context.Context) error {
		p := page.PrintToPDF().
			WithPrintBackground(opts.Background).
			WithPaperWidth(opts.PaperWidth).
			WithPaperHeight(opts.PaperHeight).
			WithMarginTop(opts.MarginTop).
			WithMarginRight(opts.MarginRight).
			WithMarginBottom(opts.MarginBottom).
			WithMarginLeft(opts.MarginLeft).
			WithLandscape(opts.Landscape).
			// Deliberately false: the size comes from theme.json, not from an
			// @page that slipped into the CSS. Single source of truth.
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

	if err := chromedp.Run(ctx, actions...); err != nil {
		return nil, err
	}
	return pdf, nil
}

// Prep is a step that runs with the page loaded and BEFORE printing. This is
// where mermaid comes in: it waits for its asynchronous render to resolve.
type Prep func(*PDFOptions) chromedp.Action

// AwaitJS evaluates an expression and WAITS for its promise to resolve.
//
// This is the piece that makes mmdc unnecessary. The old script pre-rendered
// diagrams with a separate binary because "Puppeteer prints without waiting
// for mermaid's asynchronous render". That was true of the closed pipeline of
// md-to-pdf, not of CDP: driving Chrome ourselves lets us ask for
// awaitPromise and there is no race to lose.
func AwaitJS(expr string) chromedp.Action {
	return chromedp.Evaluate(expr, nil, func(p *runtime.EvaluateParams) *runtime.EvaluateParams {
		return p.WithAwaitPromise(true)
	})
}

// BandOrEmpty: Chrome blows up with an empty template, so it needs something.
func BandOrEmpty(s string) string {
	if strings.TrimSpace(s) == "" {
		return "<span></span>"
	}
	return s
}
