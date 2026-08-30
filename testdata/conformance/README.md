# Fixtures de conformidad

Estos casos definen la semántica de herencia de theme packs, y los corren **las
dos implementaciones**: el cargador de Go del CLI y el de TypeScript del plugin.

¿Por qué existen? Porque la lógica de herencia vive dos veces, en dos lenguajes.
Si las dos no coinciden exactamente, el mismo theme pack rinde distinto en la
terminal y en Obsidian — que es lo único que este proyecto existe para evitar.

Cada caso trae sus propios packs, así que no dependen de `themes/`. La suite es
la fuente de verdad de la semántica: si un caso cambia, cambian las dos
implementaciones o el contrato está roto.

## Formato

```jsonc
{
  "name": "...",
  "why": "qué regla del contrato verifica este caso",
  "packs": { "<id>": { "json": { ... }, "css": "..." } },
  "load": "<id a resolver>",
  "expect": { "chain": [...], "tokens": {...}, "page": {...}, "css": "..." }
  // o bien:
  "expectError": "subcadena que el mensaje de error debe contener"
}
```

`expect` es **parcial**: solo se comparan las claves presentes. `css` se compara
normalizando espacios en blanco, porque cada implementación arma los comentarios
separadores a su manera.
