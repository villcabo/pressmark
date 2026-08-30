package mermaid

import "testing"

func TestExtract(t *testing.T) {
	cases := []struct {
		name  string
		in    string
		want  string
		found bool
	}{
		{"simple", "```mermaid\nflowchart LR\nA-->B\n```", `<pre class="mermaid">flowchart LR
A--&gt;B</pre>`, true},
		{"no mermaid", "```go\nfmt.Println()\n```", "```go\nfmt.Println()\n```", false},
		{"mermaid nested in a longer block is NOT touched",
			"~~~~\n```mermaid\nA-->B\n```\n~~~~", "~~~~\n```mermaid\nA-->B\n```\n~~~~", false},
		{"unclosed is returned as-is", "```mermaid\nA-->B", "```mermaid\nA-->B", true},
	}
	for _, c := range cases {
		got, found := Extract([]byte(c.in))
		if string(got) != c.want {
			t.Errorf("%s:\n  want %q\n  got %q", c.name, c.want, got)
		}
		if found != c.found {
			t.Errorf("%s: found=%v, expected %v", c.name, found, c.found)
		}
	}
}
