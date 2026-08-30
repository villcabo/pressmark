// Package mermaid renders ```mermaid blocks inside the SAME page that is
// going to be printed.
//
// The old script pre-rendered each diagram with mmdc into a separate SVG, and
// its comment explained why: "injecting mermaid.js doesn't work, its render is
// asynchronous and Puppeteer prints without waiting for it". That was true of
// the closed pipeline of md-to-pdf, not of CDP. Driving Chrome ourselves lets
// us ask for awaitPromise and there is no race. mmdc, node and python3 are
// gone.
package mermaid

import (
	_ "embed"
	"fmt"
	"html"
	"strings"
)

//go:embed vendor/mermaid.min.js
var libJS string

// LibJS returns the embedded mermaid.js. The binary downloads nothing from
// the network.
func LibJS() string { return libJS }

// Extract replaces every ```mermaid block with a <pre class="mermaid"> holding
// the diagram code, and reports whether it found any.
//
// This runs on the markdown, not on the HTML, because the syntax highlighter
// mangles diagram code: it fills it with <span> and mermaid can no longer
// parse it.
func Extract(src []byte) ([]byte, bool) {
	lines := strings.Split(string(src), "\n")
	var out []string
	var diagram []string

	// Fence state per CommonMark: we have to remember which character opened
	// it and how many of them. A ```mermaid inside a ~~~~ block is content.
	var fenceChar byte
	var fenceLen int
	inMermaid := false
	found := false

	for _, l := range lines {
		c, n, rest := fence(l)

		if fenceLen == 0 {
			// Outside any block: this can open one.
			if n > 0 {
				fenceChar, fenceLen = c, n
				if strings.TrimSpace(rest) == "mermaid" {
					inMermaid, found = true, true
					diagram = diagram[:0]
					continue
				}
			}
			out = append(out, l)
			continue
		}

		// Inside a block: it only closes with the same character, equal or
		// longer, and no info string.
		if n >= fenceLen && c == fenceChar && strings.TrimSpace(rest) == "" {
			if inMermaid {
				out = append(out, `<pre class="mermaid">`+
					html.EscapeString(strings.Join(diagram, "\n"))+"</pre>")
				inMermaid = false
			} else {
				out = append(out, l)
			}
			fenceChar, fenceLen = 0, 0
			continue
		}

		if inMermaid {
			diagram = append(diagram, l)
		} else {
			out = append(out, l)
		}
	}

	// Unclosed block: returned as-is, no closing fence is invented.
	if inMermaid {
		out = append(out, "```mermaid")
		out = append(out, diagram...)
	}
	return []byte(strings.Join(out, "\n")), found
}

// fence recognizes a fence line: up to 3 spaces of indentation and 3 or more
// backticks or tildes. Returns the character, how many, and what follows.
func fence(l string) (byte, int, string) {
	i := 0
	for i < len(l) && i < 4 && l[i] == ' ' {
		i++
	}
	if i >= len(l) || i == 4 {
		return 0, 0, ""
	}
	c := l[i]
	if c != '`' && c != '~' {
		return 0, 0, ""
	}
	j := i
	for j < len(l) && l[j] == c {
		j++
	}
	if j-i < 3 {
		return 0, 0, ""
	}
	return c, j - i, l[j:]
}

// InitJS starts mermaid with the theme's palette and RETURNS A PROMISE.
// Whoever calls it has to await it: that's the whole point.
func InitJS(accent, faint, ink string) string {
	return fmt.Sprintf(`(async () => {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    fontFamily: getComputedStyle(document.documentElement)
                  .getPropertyValue('--font') || 'sans-serif',
    theme: 'base',
    themeVariables: {
      primaryColor: %[2]q,
      primaryTextColor: %[3]q,
      primaryBorderColor: %[1]q,
      lineColor: %[1]q,
      secondaryColor: %[2]q,
      tertiaryColor: '#ffffff',
      fontSize: '13px'
    }
  });
  await mermaid.run({ querySelector: 'pre.mermaid' });
  // SVGs come out with width at 100%% and overflow on paper.
  document.querySelectorAll('pre.mermaid svg').forEach(s => {
    s.removeAttribute('width');
    s.style.maxWidth = '100%%';
    s.style.height = 'auto';
  });
  return true;
})()`, accent, faint, ink)
}
