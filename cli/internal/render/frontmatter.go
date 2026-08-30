package render

import "strings"

// SplitFrontmatter separa el frontmatter YAML del cuerpo del documento.
//
// No es cosmetico. Sin esto el `---` de apertura del frontmatter es el PRIMER
// <hr> del documento, y como la portada se cierra con el primer <hr>, el salto
// de pagina cae ahi: sale una carilla en blanco y el frontmatter impreso en la
// siguiente. Medido sobre un documento real.
//
// Reglas: tiene que abrir en la primerisima linea con `---` y cerrar con una
// linea que sea exactamente `---` o `...`. Sin cierre NO es frontmatter y el
// documento se devuelve intacto: inventar un cierre seria peor que no filtrar.
func SplitFrontmatter(src []byte) (campos map[string]string, cuerpo []byte) {
	lineas := strings.Split(string(src), "\n")
	if len(lineas) < 2 || strings.TrimRight(lineas[0], " \t\r") != "---" {
		return nil, src
	}

	fin := -1
	for i := 1; i < len(lineas); i++ {
		l := strings.TrimRight(lineas[i], " \t\r")
		if l == "---" || l == "..." {
			fin = i
			break
		}
	}
	if fin < 0 {
		return nil, src // sin cierre: no era frontmatter
	}

	campos = parsearYAMLPlano(lineas[1:fin])
	return campos, []byte(strings.Join(lineas[fin+1:], "\n"))
}

// parsearYAMLPlano lee los pares `clave: valor` del primer nivel.
//
// A proposito NO es un parser de YAML: solo se necesita exponer los campos como
// {{fm.clave}} en encabezado y pie. Lo anidado se ignora en vez de fallar,
// porque un frontmatter raro no puede impedir que el documento se exporte.
func parsearYAMLPlano(lineas []string) map[string]string {
	out := map[string]string{}
	for _, l := range lineas {
		if l == "" || strings.HasPrefix(strings.TrimSpace(l), "#") {
			continue
		}
		if l[0] == ' ' || l[0] == '\t' || strings.HasPrefix(strings.TrimSpace(l), "- ") {
			continue // anidado: fuera de alcance
		}
		k, v, ok := strings.Cut(l, ":")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		v = strings.Trim(v, `"'`)
		// Las listas [a, b, c] se aplanan a "a, b, c", que es lo unico util
		// que se puede poner en un pie de pagina.
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

// TitleFrom devuelve el titulo del documento: el campo title del frontmatter si
// existe, si no el primer h1, si no el nombre del archivo.
func TitleFrom(campos map[string]string, cuerpo []byte, fallback string) string {
	if t, ok := campos["title"]; ok && t != "" {
		return t
	}
	if t, ok := campos["titulo"]; ok && t != "" {
		return t
	}
	return Title(cuerpo, fallback)
}
