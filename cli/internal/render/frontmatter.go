package render

import "strings"

// SplitFrontmatter separates the YAML frontmatter from the document body.
//
// This is not cosmetic. Without it, the frontmatter's opening `---` is the
// FIRST <hr> of the document, and since the cover closes on the first <hr>,
// the page break lands there: a blank page comes out with the frontmatter
// printed on the next one. Measured on a real document.
//
// Rules: it has to open on the very first line with `---` and close with a
// line that is exactly `---` or `...`. Without a closing line it is NOT
// frontmatter and the document is returned intact: inventing a closing line
// would be worse than not filtering at all.
func SplitFrontmatter(src []byte) (fields map[string]string, body []byte) {
	lines := strings.Split(string(src), "\n")
	if len(lines) < 2 || strings.TrimRight(lines[0], " \t\r") != "---" {
		return nil, src
	}

	end := -1
	for i := 1; i < len(lines); i++ {
		l := strings.TrimRight(lines[i], " \t\r")
		if l == "---" || l == "..." {
			end = i
			break
		}
	}
	if end < 0 {
		return nil, src // no closing line: it wasn't frontmatter
	}

	fields = parseFlatYAML(lines[1:end])
	return fields, []byte(strings.Join(lines[end+1:], "\n"))
}

// parseFlatYAML reads the top-level `key: value` pairs.
//
// It is deliberately NOT a YAML parser: it only needs to expose the fields as
// {{fm.key}} in the header and footer. Nested content is ignored rather than
// failing, because odd frontmatter can't be allowed to block the document
// from exporting.
func parseFlatYAML(lines []string) map[string]string {
	out := map[string]string{}
	for _, l := range lines {
		if l == "" || strings.HasPrefix(strings.TrimSpace(l), "#") {
			continue
		}
		if l[0] == ' ' || l[0] == '\t' || strings.HasPrefix(strings.TrimSpace(l), "- ") {
			continue // nested: out of scope
		}
		k, v, ok := strings.Cut(l, ":")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		v = strings.Trim(v, `"'`)
		// Lists [a, b, c] are flattened to "a, b, c", which is the only thing
		// useful to put in a page footer.
		if strings.HasPrefix(v, "[") && strings.HasSuffix(v, "]") {
			v = strings.TrimSpace(strings.Trim(v, "[]"))
		}
		if k != "" {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// TitleFrom returns the document title: the frontmatter's title field if it
// exists, otherwise the first h1, otherwise the file name.
func TitleFrom(fields map[string]string, body []byte, fallback string) string {
	if t, ok := fields["title"]; ok && t != "" {
		return t
	}
	return Title(body, fallback)
}
