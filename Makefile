# themes/ es la fuente de verdad. go:embed no puede usar '..', asi que hay que
# copiarlas adentro del modulo antes de compilar. La copia esta gitignoreada.
THEMES_SRC := themes
THEMES_DST := cli/internal/themes/packs

.PHONY: all sync-themes build plugin install validate test clean

all: build

sync-themes:
	@rm -rf $(THEMES_DST)
	@mkdir -p $(THEMES_DST)
	@cp -R $(THEMES_SRC)/. $(THEMES_DST)/
	@rm -f $(THEMES_DST)/theme.schema.json
	@echo "themes sincronizados -> $(THEMES_DST)"
	@bun tools/gen-plugin-themes.mjs

build: validate sync-themes
	@cd cli && go build -o ../dist/pressmark ./cmd/pressmark
	@echo "binario -> dist/pressmark"

validate:
	@bun tools/validate.mjs

test: sync-themes
	@cd cli && go test ./...
	@cd plugin && bun test

plugin: validate sync-themes
	@cd plugin && bun run build
	@echo "plugin -> main.js"

# Instala el plugin en un vault. VAULT se puede pasar por linea de comandos:
#   make install VAULT=/ruta/a/mi/vault
VAULT ?= $(HOME)/.obsidian/personal/MarckV_Personal

install: plugin
	@mkdir -p "$(VAULT)/.obsidian/plugins/pressmark"
	@cp manifest.json main.js styles.css "$(VAULT)/.obsidian/plugins/pressmark/"
	@echo "instalado -> $(VAULT)/.obsidian/plugins/pressmark"

clean:
	@rm -rf dist $(THEMES_DST) main.js plugin/src/themes.generated.ts
