# Formato de theme pack

Un theme pack es una carpeta con dos archivos obligatorios:

```
mi-theme/
├─ theme.json      identidad, tokens y geometria de pagina
├─ theme.css       estilos, que consumen los tokens con var(--nombre)
└─ fonts/          opcional: tipografias empaquetadas
```

El esquema formal esta en [`../themes/theme.schema.json`](../themes/theme.schema.json).
`bun run validate` verifica todos los packs contra el.

## La regla que ordena todo

> **La paleta y la geometria de pagina viven en `theme.json`. El CSS solo las consume.**

El renderer lee `theme.json`, emite los tokens como variables CSS en `:root`, y
recien despues carga `theme.css`. Por eso un `theme.css` **no puede** declarar
`:root` ni `@page` — el validador lo rechaza.

¿Y por que tanto rigor? Porque la alternativa ya se probo y fallo: en el formato
viejo el margen estaba en el CSS *y* en un JSON aparte, con valores distintos en
los 6 temas y sin que nadie se enterara. Una sola fuente de verdad no es purismo,
es la unica forma de que eso no vuelva a pasar.

## `theme.json`

```jsonc
{
  "$schema": "../theme.schema.json",
  "id": "mi-theme",              // debe coincidir con el nombre de la carpeta
  "name": "Mi Theme",
  "version": "1.0.0",
  "extends": "_base",            // herencia por clave; el CSS se apila

  "tokens": {                    // se emiten como --acento, --tinta, ...
    "acento": "#1e4d3b",
    "portada-offset": "58mm"
  },

  "page": {
    "size": "A4",                // o { "width": "...", "height": "..." }
    "margin": { "top": "24mm", "right": "18mm", "bottom": "18mm", "left": "18mm" },
    "printBackground": true
  },

  "cover": { "enabled": true, "break": "page" },

  "footer": {
    "enabled": true,
    "left":  "{{vars.confidencialidad}}",
    "right": "Pagina {{page}} de {{pages}}",
    "rule": true
  },
  "vars": { "confidencialidad": "Confidencial · uso interno" }
}
```

### Herencia

`extends` mezcla **clave a clave** (superficial): `tokens`, `page`, `cover`,
`header`, `footer` y `vars`. El CSS no se mezcla, se **apila**: primero el del
padre, despues el propio. `extends: null` no hereda nada.

Un pack cuyo `id` empieza con `_` es interno: se puede heredar de el, pero no se
le ofrece al usuario para elegir.

## Portada por convencion

No hay markup especial. La portada se arma con lo que ya escribis en Markdown:

```markdown
# Titulo del documento          <- primer h1: el titulo

**Sistema:** X · **Fecha:** Y   <- el parrafo que sigue: la metadata

---                             <- el primer <hr>: cierra la portada
```

`cover.enabled` prende el tratamiento; `cover.break` decide si el `<hr>` corta
pagina. El alto se controla con el token `portada-offset`, no con CSS.

## Encabezado y pie

Se componen por ranuras `left` / `center` / `right`. El renderer genera el HTML
e **inyecta el margen lateral por su cuenta**, para que nunca haya que
sincronizarlo a mano con `page.margin`.

Placeholders: `{{page}}`, `{{pages}}`, `{{title}}`, `{{date}}`, `{{file}}` y
`{{vars.CUALQUIERA}}`.

## Contrato de estructura HTML

Los dos renderers envuelven el documento en:

```html
<article class="pm-doc"> ... </article>
```

y garantizan que los bloques de primer nivel (`h1`, `p`, `hr`, `table`, ...) sean
hijos **directos** de ese elemento. El CSS de los themes depende de eso:
`.pm-doc > h1:first-of-type` es lo que hace la portada.

Sin este contrato el mismo theme pack rendiria distinto en la terminal y en
Obsidian, que es exactamente lo que el proyecto existe para evitar.

## `tokenSchema` y la UI

`themes/_base/theme.json` declara el tipo y la etiqueta de cada token:

```jsonc
"tokenSchema": {
  "acento": { "type": "color", "group": "paleta", "label": "Acento" }
}
```

Tipos: `color`, `font-stack`, `length`, `number`, `text`.

El plugin **genera el formulario leyendo esto**. No hay 13 color pickers
escritos a mano: agregas un token con su entrada de schema y su control aparece
solo. Un token sin entrada en `tokenSchema` es un error de validacion.
