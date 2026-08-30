package mermaid

import "testing"

func TestExtract(t *testing.T) {
	casos := []struct {
		nombre string
		in     string
		quiere string
		hubo   bool
	}{
		{"simple", "```mermaid\nflowchart LR\nA-->B\n```", `<pre class="mermaid">flowchart LR
A--&gt;B</pre>`, true},
		{"sin mermaid", "```go\nfmt.Println()\n```", "```go\nfmt.Println()\n```", false},
		{"mermaid anidado en bloque mas largo NO se toca",
			"~~~~\n```mermaid\nA-->B\n```\n~~~~", "~~~~\n```mermaid\nA-->B\n```\n~~~~", false},
		{"sin cerrar se devuelve tal cual", "```mermaid\nA-->B", "```mermaid\nA-->B", true},
	}
	for _, c := range casos {
		got, hubo := Extract([]byte(c.in))
		if string(got) != c.quiere {
			t.Errorf("%s:\n  quiere %q\n  obtuvo %q", c.nombre, c.quiere, got)
		}
		if hubo != c.hubo {
			t.Errorf("%s: hubo=%v, esperaba %v", c.nombre, hubo, c.hubo)
		}
	}
}
