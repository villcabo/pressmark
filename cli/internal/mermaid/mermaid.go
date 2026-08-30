// Package mermaid renderiza los bloques ```mermaid dentro de la MISMA pagina
// que se va a imprimir.
//
// El script viejo pre-renderizaba cada diagrama con mmdc a un SVG aparte, y su
// comentario explicaba por que: "inyectar mermaid.js no sirve, su render es
// asincrono y Puppeteer imprime sin esperarlo". Eso era cierto del pipeline
// cerrado de md-to-pdf, no de CDP. Manejando Chrome uno mismo se pide
// awaitPromise y no hay carrera. Se caen mmdc, node y python3.
package mermaid

import (
	_ "embed"
	"fmt"
	"html"
	"strings"
)

//go:embed vendor/mermaid.min.js
var libJS string

// LibJS devuelve mermaid.js embebido. El binario no baja nada de la red.
func LibJS() string { return libJS }

// Extract reemplaza cada bloque ```mermaid por un <pre class="mermaid"> con el
// codigo del diagrama, y avisa si encontro alguno.
//
// Se hace sobre el markdown y no sobre el HTML porque el resaltador de sintaxis
// destroza el codigo del diagrama: lo llena de <span> y mermaid ya no lo parsea.
func Extract(src []byte) ([]byte, bool) {
	lineas := strings.Split(string(src), "\n")
	var out []string
	var diagrama []string

	// Estado de fence segun CommonMark: hay que recordar con que caracter y con
	// cuantos se abrio. Un ```mermaid adentro de un bloque ~~~~ es contenido.
	var fenceChar byte
	var fenceLen int
	enMermaid := false
	hubo := false

	for _, l := range lineas {
		c, n, resto := fence(l)

		if fenceLen == 0 {
			// Fuera de todo bloque: esto puede abrir uno.
			if n > 0 {
				fenceChar, fenceLen = c, n
				if strings.TrimSpace(resto) == "mermaid" {
					enMermaid, hubo = true, true
					diagrama = diagrama[:0]
					continue
				}
			}
			out = append(out, l)
			continue
		}

		// Dentro de un bloque: solo cierra el mismo caracter, igual o mas largo,
		// y sin info string.
		if n >= fenceLen && c == fenceChar && strings.TrimSpace(resto) == "" {
			if enMermaid {
				out = append(out, `<pre class="mermaid">`+
					html.EscapeString(strings.Join(diagrama, "\n"))+"</pre>")
				enMermaid = false
			} else {
				out = append(out, l)
			}
			fenceChar, fenceLen = 0, 0
			continue
		}

		if enMermaid {
			diagrama = append(diagrama, l)
		} else {
			out = append(out, l)
		}
	}

	// Bloque sin cerrar: se devuelve tal cual, no se inventa un cierre.
	if enMermaid {
		out = append(out, "```mermaid")
		out = append(out, diagrama...)
	}
	return []byte(strings.Join(out, "\n")), hubo
}

// fence reconoce una linea de cerca: hasta 3 espacios de sangria y 3 o mas
// backticks o tildes. Devuelve el caracter, cuantos, y lo que sigue.
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

// InitJS arranca mermaid con la paleta del theme y DEVUELVE UNA PROMESA.
// Quien la llame tiene que esperarla: ahi esta todo el asunto.
func InitJS(acento, tenue, tinta string) string {
	return fmt.Sprintf(`(async () => {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    fontFamily: getComputedStyle(document.documentElement)
                  .getPropertyValue('--fuente') || 'sans-serif',
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
  // Los SVG salen con width al 100%% y se desbordan en papel.
  document.querySelectorAll('pre.mermaid svg').forEach(s => {
    s.removeAttribute('width');
    s.style.maxWidth = '100%%';
    s.style.height = 'auto';
  });
  return true;
})()`, acento, tenue, tinta)
}
