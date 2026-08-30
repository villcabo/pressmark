# Nota de diagnóstico

Documento sin portada ni elementos complejos. Verifica que el arranque directo
funcione y que no se cuele un salto de página fantasma.

## Hallazgo

El margen está declarado en dos lugares y los valores no coinciden.

| Fuente | Valor lateral |
| ------ | ------------- |
| `@page` en CSS | 19mm |
| `.pdf.json`    | 18mm |
