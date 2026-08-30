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

## Estado

Fase 0 — formato definido, temas migrados. El CLI y el plugin todavia no existen.
Ver [`MIGRATION.md`](MIGRATION.md) para lo que cambio al migrar, incluido un bug
de margenes duplicados que arrastraban los 6 temas.

## Desarrollo

```bash
bun install
bun run validate     # valida los theme packs: esquema + contrato de tokens
```

## Licencia

MIT
