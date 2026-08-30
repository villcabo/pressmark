#!/usr/bin/env python3
"""Migra los temas de ~/.config/md2pdf/temas al formato theme pack.

Transformaciones, todas deterministas:
  1. El bloque :root { --x: y }  ->  theme.json .tokens   (y se saca del CSS)
  2. El bloque @page { }         ->  theme.json .page     (y se saca del CSS)
  3. El .pdf.json                ->  theme.json .page/.footer/.vars
  4. Selectores 'body'           ->  '.m2p-doc'  (contrato de estructura HTML)
  5. '#title-block-header'       ->  eliminado   (fuga de pandoc)

Cuando @page y .pdf.json declaran margenes distintos -- que es SIEMPRE --
se reporta la discrepancia y se conserva el valor del .pdf.json, que es el
que viaja a printToPDF. El otro queda registrado en MIGRATION.md.
"""
import json, re, sys, pathlib

ORIGEN  = pathlib.Path.home() / ".config/md2pdf/temas"
DESTINO = pathlib.Path(__file__).resolve().parent.parent / "themes"
TEMAS   = ["informe", "nota", "ejecutivo", "tecnico", "minimal", "moderno"]

NOMBRES = {
    "informe":   ("Informe",   "Documento formal con portada y margenes amplios. El canonico."),
    "nota":      ("Nota",      "Sin portada, arranca directo. Compacto, para diagnosticos y listas."),
    "ejecutivo": ("Ejecutivo", "Titulos en serif, azul de tinta, mucho aire. Para direccion y comite."),
    "tecnico":   ("Tecnico",   "Denso, grafito, portada de media carilla. El codigo manda."),
    "minimal":   ("Minimal",   "Sin un solo color. Tipografia y espacio. Imprime igual en blanco y negro."),
    "moderno":   ("Moderno",   "Inter Display, ciruela, esquinas suaves. Propuestas y producto."),
}

reporte = []

def extraer_bloque(css, selector):
    """Saca el primer bloque `selector { ... }` y devuelve (cuerpo, css_sin_bloque)."""
    m = re.search(r'^' + re.escape(selector) + r'\s*\{([^}]*)\}\s*\n?', css, re.M)
    if not m:
        return None, css
    return m.group(1), css[:m.start()] + css[m.end():]

def parsear_decls(cuerpo):
    """'--a: 1; --b: 2' -> {'a': '1', 'b': '2'} (sin el -- inicial), respeta comentarios."""
    cuerpo = re.sub(r'/\*.*?\*/', '', cuerpo, flags=re.S)
    out = {}
    for decl in cuerpo.split(';'):
        if ':' not in decl:
            continue
        k, v = decl.split(':', 1)
        k, v = k.strip(), v.strip()
        if k:
            out[k[2:] if k.startswith('--') else k] = v
    return out

def margen_shorthand(valor):
    """'24mm 19mm 18mm 19mm' -> dict CSS-order. Soporta 1, 2, 3 y 4 valores."""
    p = valor.split()
    if   len(p) == 1: t = r = b = l = p[0]
    elif len(p) == 2: t, r = p; b, l = t, r
    elif len(p) == 3: t, r, b = p; l = r
    else:             t, r, b, l = p[:4]
    return {"top": t, "right": r, "bottom": b, "left": l}

def limpiar_css(css):
    """Contrato de estructura + saca la fuga de pandoc."""
    css = re.sub(r'^#title-block-header\s*\{[^}]*\}\s*\n?', '', css, flags=re.M)
    css = re.sub(r'(?<![\w.#-])body(?=\s*[,{>])', '.m2p-doc', css)
    return re.sub(r'\n{3,}', '\n\n', css).strip() + "\n"

def migrar(nombre, css_src, json_src, destino, meta):
    css = css_src.read_text(encoding="utf-8")

    root_body, css = extraer_bloque(css, ":root")
    tokens = parsear_decls(root_body) if root_body else {}

    page_body, css = extraer_bloque(css, "@page")
    page_css = parsear_decls(page_body) if page_body else {}

    pdfopts = json.loads(json_src.read_text(encoding="utf-8")) if json_src.exists() else {}

    # --- margenes: comparar las dos fuentes -------------------------------
    m_css  = margen_shorthand(page_css["margin"]) if "margin" in page_css else None
    m_json = pdfopts.get("margin")
    if m_css and m_json and m_css != m_json:
        reporte.append({
            "tema": nombre, "css": m_css, "pdf_json": m_json,
            "elegido": "pdf_json",
        })
    margin = m_json or m_css or {}

    page = {"size": page_css.get("size", "A4"), "margin": margin,
            "printBackground": bool(pdfopts.get("printBackground", True))}

    # --- portada: se detecta, no se asume ---------------------------------
    # OJO: se evalua sobre el CSS crudo, ANTES de reescribir body -> .m2p-doc
    tiene_portada = bool(re.search(r'body\s*>\s*h1:first-of-type', css))
    corta = bool(re.search(r'body\s*>\s*hr:first-of-type[^}]*break-after:\s*page', css))
    # El discriminador real es el salto de pagina, no el estilo del h1: 'nota'
    # estila el primer <hr> pero NO corta, y por eso no tiene portada.
    cover = {"enabled": bool(tiene_portada and corta), "break": "page" if corta else "none"}

    # --- pie: de HTML hardcodeado a ranuras -------------------------------
    footer, vars_ = {"enabled": False}, {}
    if pdfopts.get("displayHeaderFooter") and pdfopts.get("footerTemplate"):
        ft = pdfopts["footerTemplate"]
        izq = re.search(r'<span>([^<]+)</span>\s*<span>P', ft)
        col = re.search(r'color:(#[0-9a-fA-F]{3,8})', ft)
        tam = re.search(r'font-size:([0-9.]+pt)', ft)
        if izq:
            vars_["confidencialidad"] = izq.group(1).strip()
        footer = {
            "enabled": True,
            "left":  "{{vars.confidencialidad}}" if izq else "",
            "right": "Pagina {{page}} de {{pages}}",
            "rule": "border-top" in ft,
            "fontSize": tam.group(1) if tam else "7pt",
            "color": col.group(1) if col else "#8a9099",
        }

    theme = {
        "$schema": "../theme.schema.json",
        "id": nombre, "name": meta[0], "description": meta[1],
        "version": "1.0.0", "extends": "_base",
    }
    if tokens: theme["tokens"] = tokens
    theme["page"] = page
    theme["cover"] = cover
    if footer["enabled"]: theme["footer"] = footer
    if vars_: theme["vars"] = vars_

    destino.mkdir(parents=True, exist_ok=True)
    (destino / "theme.json").write_text(json.dumps(theme, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (destino / "theme.css").write_text(limpiar_css(css), encoding="utf-8")
    return tokens, page, cover

# ---- _base ---------------------------------------------------------------
base_css = (ORIGEN / "base.css").read_text(encoding="utf-8")
root_body, base_css = extraer_bloque(base_css, ":root")
base_tokens = parsear_decls(root_body)
(DESTINO / "_base").mkdir(parents=True, exist_ok=True)
(DESTINO / "_base" / "theme.css").write_text(limpiar_css(base_css), encoding="utf-8")
print(f"_base       tokens={len(base_tokens)}")

# ---- temas ---------------------------------------------------------------
for t in TEMAS:
    tk, pg, cv = migrar(t, ORIGEN / f"{t}.css", ORIGEN / f"{t}.pdf.json", DESTINO / t, NOMBRES[t])
    print(f"{t:<11} tokens={len(tk):<2} portada={'si' if cv['enabled'] else 'no':<3} margen={pg['margin'].get('top','?')}/{pg['margin'].get('left','?')}")

(DESTINO / "_base" / "_tokens.json").write_text(json.dumps(base_tokens, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
pathlib.Path(DESTINO.parent / "tools/_discrepancias.json").write_text(json.dumps(reporte, indent=2) + "\n", encoding="utf-8")
print(f"\ndiscrepancias de margen detectadas: {len(reporte)}")
