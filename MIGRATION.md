# Migración de `~/.config/md2pdf/temas` a theme packs

Registro de lo que cambió al pasar los 6 temas al formato `theme.json` + `theme.css`.
La conversión la hizo `tools/migrate.py`, no una transcripción a mano.

## 1. El margen estaba declarado dos veces, y nunca coincidía

En los 6 temas. No era un typo aislado:

| Tema | `@page` en CSS | `.pdf.json` | Difieren en |
| ---- | -------------- | ----------- | ----------- |
| `ejecutivo` | `26mm 23mm 20mm 23mm` | `26mm 22mm 20mm 22mm` | laterales |
| `informe` | `24mm 19mm 18mm 19mm` | `24mm 18mm 18mm 18mm` | laterales |
| `minimal` | `28mm 25mm 22mm 25mm` | `28mm 24mm 22mm 24mm` | laterales |
| `moderno` | `24mm 21mm 20mm 21mm` | `24mm 20mm 20mm 20mm` | laterales |
| `nota` | `18mm 17mm 16mm 17mm` | `16mm 15mm 16mm 15mm` | todos |
| `tecnico` | `20mm 16mm 18mm 16mm` | `20mm 15mm 18mm 15mm` | laterales |

**Causa, verificada:** había dos pipelines leyendo fuentes distintas.

- `md2pdf` → `md-to-pdf` → `printToPDF` con el margen del `.pdf.json`.
- `md2pdf-pandoc` → `chrome --print-to-pdf`, que **no acepta flag de márgenes**:
  los toma únicamente del `@page` del CSS.

Ninguna de las dos estaba mal. Servían a scripts distintos y se separaron sin
que nada avisara. El patrón lo delata: el CSS tiene exactamente 1mm más en los
laterales en 5 de 6 temas.

**Decisión:** el valor del `.pdf.json` es el que se conserva, porque es el que
produjo los PDF que venís usando. El `@page` desaparece del CSS y `page.margin`
de `theme.json` queda como fuente única. `tools/validate.mjs` rechaza cualquier
`theme.css` que vuelva a declarar `@page`.

## 2. El pie de página tenía el texto y el margen incrustados

El `footerTemplate` era HTML crudo con `"Confidencial · uso interno"` adentro y
un `padding: 0 18mm` que había que sincronizar a mano con `margin.left`.

Ahora son ranuras:

```json
"footer": { "left": "{{vars.confidencialidad}}", "right": "Pagina {{page}} de {{pages}}" },
"vars":   { "confidencialidad": "Confidencial · uso interno" }
```

El renderer inyecta el margen por su cuenta. Ya no hay dos números que mantener iguales.

## 3. La portada era una ausencia, ahora es una declaración

Ningún tema definía `.portada`. La portada es **por convención**: primer `h1`,
el párrafo que le sigue, y el primer `<hr>` que corta página.

El discriminador real resultó ser `break-after: page`, no el estilo del `h1`:
`nota` estila el primer `<hr>` pero **no corta**, y por eso no tiene portada.
Detectarlo por el estilo del `h1` daba un falso positivo. Ahora es explícito:
`"cover": { "enabled": false, "break": "none" }`.

## 4. `margin-top` de portada → token `--portada-offset`

Era un número fijo en el CSS de cada tema. Ahora es un token, así que se pasa de
portada entera a media carilla desde la UI, sin tocar CSS:

| Tema | offset |
| ---- | ------ |
| `tecnico` | 22mm (media carilla) |
| `informe` | 58mm |
| `moderno` | 62mm |
| `ejecutivo` | 72mm |
| `minimal` | 82mm |

## 5. Contrato de estructura HTML: `body` → `.m2p-doc`

Los selectores eran `body > h1:first-of-type`. En Obsidian el contenido no
cuelga de `<body>`, así que **la portada no habría funcionado en el plugin**.

Ambos renderers deben envolver el documento en `<article class="m2p-doc">` y
garantizar que los bloques de primer nivel sean hijos DIRECTOS de ese elemento.
Ese es el contrato que hace que el mismo theme pack rinda igual en los dos lados.

## 6. Fuga de pandoc eliminada

`#title-block-header { display: none; }` existía para tapar un `<header>` que
inyecta `pandoc --standalone`. En el pipeline nuevo ese elemento no existe.

---

## Pendiente de verificar en la Fase 1

Cuando el CLI maneje Chrome por CDP, comprobar contra un PDF de referencia si
`@page { margin }` en CSS y el margen de `printToPDF` se pisan o se suman.
La migración asume que **el de `printToPDF` manda** y que el `@page` era
ignorado por `md2pdf`. Es la hipótesis más probable, no está medida.
