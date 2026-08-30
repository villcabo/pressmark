package theme

import (
	"io/fs"
	"os"
)

// Overlay busca primero en los themes del usuario y cae a los embebidos.
//
// Hace falta porque la herencia cruza las dos fuentes: un theme propio del
// usuario declara extends "_base", y _base vive dentro del binario.
type overlay struct{ capas []fs.FS }

func Overlay(capas ...fs.FS) fs.FS {
	var out []fs.FS
	for _, c := range capas {
		if c != nil {
			out = append(out, c)
		}
	}
	return overlay{out}
}

func (o overlay) Open(name string) (fs.File, error) {
	var ultimo error
	for _, c := range o.capas {
		f, err := c.Open(name)
		if err == nil {
			return f, nil
		}
		ultimo = err
	}
	if ultimo == nil {
		ultimo = fs.ErrNotExist
	}
	return nil, ultimo
}

func (o overlay) ReadDir(name string) ([]fs.DirEntry, error) {
	visto := map[string]bool{}
	var out []fs.DirEntry
	var ultimo error
	for _, c := range o.capas {
		e, err := fs.ReadDir(c, name)
		if err != nil {
			ultimo = err
			continue
		}
		for _, x := range e {
			if !visto[x.Name()] {
				visto[x.Name()] = true
				out = append(out, x)
			}
		}
		ultimo = nil
	}
	return out, ultimo
}

// UserDir devuelve el directorio de themes del usuario si existe.
func UserDir(explicito string) fs.FS {
	if explicito != "" {
		return os.DirFS(explicito)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	d := home + "/.config/pressmark/themes"
	if st, err := os.Stat(d); err == nil && st.IsDir() {
		return os.DirFS(d)
	}
	return nil
}
