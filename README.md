# md2topdf

Markdown a PDF con formatos definidos y personalizables, desde la terminal
**y** desde Obsidian — con el mismo resultado.

El motor de maquetado es Chromium, en los dos casos. Lo que cambia es quién lo
maneja. Lo que **no** cambia es el theme pack.

```
themes/          el producto: CSS + tokens + geometria de pagina
  ├─ cli/        binario Go: goldmark + chromedp + Chrome del sistema
  └─ plugin/     plugin de Obsidian (desktop): renderer propio + printToPDF
```

## Por que existe

Hay decenas de plugins que exportan PDF desde Obsidian. Ninguno tiene CLI, y
ninguno tiene un formato de tema portable que se versione en git y se comparta
con un equipo. Ese es el punto: **el mismo theme pack produce el mismo PDF en
los dos lados.**

## Theme packs

Un theme pack es una carpeta con `theme.json` y `theme.css`. Hay tres niveles
de personalizacion, con costos muy distintos:

| Nivel | Que tocas | Para quien |
| ----- | --------- | ---------- |
| 1 | `tokens` en `theme.json` — 13 colores y fuentes | La mayoria. Es un formulario en el plugin. |
| 2 | + `page`, `cover`, `footer` | Quien necesita su membrete y sus margenes. |
| 3 | + `theme.css` propio, con `extends` | Quien sabe CSS. |

El formulario del plugin **se genera solo** a partir de `tokenSchema` en
`themes/_base/theme.json`. Agregar un token nuevo hace aparecer su control sin
tocar la UI.

Ver [`docs/theme-format.md`](docs/theme-format.md) para el formato completo.

### Los que vienen incluidos

| Theme | Portada | Para que |
| ----- | ------- | -------- |
| `informe` | entera | Documento formal. El canonico. |
| `nota` | no | Diagnosticos y listas. Arranca directo. |
| `ejecutivo` | entera | Direccion y comite. Serif, mucho aire. |
| `tecnico` | media carilla | Specs con mucho codigo. Denso. |
| `minimal` | entera | Sin color. Imprime igual en blanco y negro. |
| `moderno` | entera | Propuestas y producto. |

## CLI

```bash
make build                                   # -> dist/md2topdf

md2topdf informe.md                          # PDF al lado del .md
md2topdf informe.md --estilo tecnico         # otro theme
md2topdf reportes/ --estilo nota --carta     # toda una carpeta
md2topdf --listar                            # themes disponibles
```

Una sola dependencia externa: **un Chrome instalado**. Verificado con stubs que
fallan si algo invoca `node`, `bun`, `npm`, `python3`, `jq`, `mmdc`, `md-to-pdf`
o `pandoc` — ninguno se dispara.

### Mermaid sin `mmdc`

Los bloques ` ```mermaid ` se renderizan **dentro de la misma pagina** que se
imprime. mermaid.js viaja embebido en el binario y el render asincrono se espera
con `awaitPromise` de CDP antes de llamar a `printToPDF`.

El script viejo no podia hacer esto y su comentario explicaba por que: "inyectar
mermaid.js no sirve, Puppeteer imprime sin esperarlo". Era cierto del pipeline
cerrado de `md-to-pdf`, no de CDP. Manejando Chrome uno mismo no hay carrera.

Los diagramas toman la paleta del theme, asi que no desentonan con el documento.

## Estado

| Fase | Que | Estado |
| ---- | --- | ------ |
| 0 | Formato de theme pack + migracion de los 6 temas | hecho |
| 1 | CLI en Go | hecho |
| 2 | Plugin de Obsidian | pendiente |
| 3 | UI de personalizacion + import/export de packs | pendiente |
| 4 | Submission al community store | pendiente |

Ver [`MIGRATION.md`](MIGRATION.md) para lo que cambio al migrar, incluido un bug
de margenes que arrastraban los 6 temas y la medicion que lo resolvio.

## Desarrollo

```bash
bun install
bun run validate     # valida los theme packs: esquema + contrato de tokens
make build           # valida, sincroniza themes y compila
make test            # tests de Go
```

### Dependencias embebidas

- [mermaid](https://github.com/mermaid-js/mermaid) 11.4.1 (MIT), en
  `cli/internal/mermaid/vendor/`. Se versiona a proposito: el binario no baja
  nada de la red en tiempo de ejecucion.

## Licencia

MIT
