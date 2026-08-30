// Package themes lleva los theme packs adentro del binario.
//
// El contenido de packs/ es una COPIA de themes/ del repo, hecha por
// `make sync-themes`. Se copia y no se referencia porque go:embed no admite
// rutas con '..': el patron tiene que estar debajo del paquete.
package themes

import (
	"embed"
	"io/fs"
)

//go:embed all:packs
var embedded embed.FS

// FS devuelve los theme packs embebidos, con packs/ ya como raiz.
func FS() fs.FS {
	sub, err := fs.Sub(embedded, "packs")
	if err != nil {
		panic(err) // solo puede fallar si el embed se rompio en tiempo de compilacion
	}
	return sub
}
