// Package themes carries the theme packs inside the binary.
//
// The content of packs/ is a COPY of the repo's themes/, made by
// `make sync-themes`. It's copied rather than referenced because go:embed
// doesn't allow paths with '..': the pattern has to be below the package.
package themes

import (
	"embed"
	"io/fs"
)

//go:embed all:packs
var embedded embed.FS

// FS returns the embedded theme packs, with packs/ already as the root.
func FS() fs.FS {
	sub, err := fs.Sub(embedded, "packs")
	if err != nil {
		panic(err) // can only fail if the embed broke at compile time
	}
	return sub
}
