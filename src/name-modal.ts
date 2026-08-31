/** Asks for a name, and shows the id it will become before committing to it. */
import { Modal, Setting, type App } from "obsidian";
import { slugify } from "./pack";
import { t } from "./i18n";

export class NameModal extends Modal {
  private value = "";

  constructor(
    app: App,
    private opts: {
      title: string;
      placeholder: string;
      taken: (id: string) => boolean;
      onSubmit: (name: string) => void;
    },
  ) {
    super(app);
  }

  override onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.opts.title });

    // The id is derived, so showing it as they type avoids the surprise of
    // "Informe Técnico" turning into a folder called informe-tecnico.
    const hint = contentEl.createDiv({ cls: "setting-item-description" });
    let submit: HTMLButtonElement | null = null;

    const refresh = () => {
      const id = slugify(this.value);
      const taken = this.opts.taken(id);
      hint.setText(
        this.value.trim() === ""
          ? ""
          : taken
            ? t("pack.idTaken", { id })
            : t("pack.willBeSavedAs", { id }),
      );
      hint.toggleClass("mod-warning", taken);
      if (submit) submit.disabled = this.value.trim() === "" || taken;
    };

    new Setting(contentEl).addText((c) => {
      c.setPlaceholder(this.opts.placeholder).onChange((v) => {
        this.value = v;
        refresh();
      });
      c.inputEl.focus();
      c.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !submit?.disabled) this.accept();
      });
    });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText(t("modal.cancel")).onClick(() => this.close()))
      .addButton((b) => {
        b.setButtonText(t("pack.save"))
          .setCta()
          .onClick(() => this.accept());
        submit = b.buttonEl;
        submit.disabled = true;
      });

    refresh();
  }

  private accept(): void {
    const name = this.value.trim();
    this.close();
    this.opts.onSubmit(name);
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
