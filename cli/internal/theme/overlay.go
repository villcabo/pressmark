package theme

import (
	"io/fs"
	"os"
)

// Overlay looks in the user's themes first and falls back to the embedded
// ones.
//
// This is needed because inheritance crosses both sources: a user's own
// theme declares extends "_base", and _base lives inside the binary.
type overlay struct{ layers []fs.FS }

func Overlay(layers ...fs.FS) fs.FS {
	var out []fs.FS
	for _, l := range layers {
		if l != nil {
			out = append(out, l)
		}
	}
	return overlay{out}
}

func (o overlay) Open(name string) (fs.File, error) {
	var last error
	for _, l := range o.layers {
		f, err := l.Open(name)
		if err == nil {
			return f, nil
		}
		last = err
	}
	if last == nil {
		last = fs.ErrNotExist
	}
	return nil, last
}

func (o overlay) ReadDir(name string) ([]fs.DirEntry, error) {
	seen := map[string]bool{}
	var out []fs.DirEntry
	var last error
	for _, l := range o.layers {
		e, err := fs.ReadDir(l, name)
		if err != nil {
			last = err
			continue
		}
		for _, x := range e {
			if !seen[x.Name()] {
				seen[x.Name()] = true
				out = append(out, x)
			}
		}
		last = nil
	}
	return out, last
}

// UserDir returns the user's theme directory if it exists.
func UserDir(explicit string) fs.FS {
	if explicit != "" {
		return os.DirFS(explicit)
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
