/**
 * The line under the preview: paper, orientation, margins, cover, footer and
 * the page count.
 *
 * It lives in its own module so it can be tested. `preview.ts` pulls in pdf.js,
 * which needs a browser to even load; this file needs nothing. And it is worth
 * testing: this line is where the user reads how many pages they are about to
 * get, and for several releases that number was an estimate that disagreed with
 * the file — 3 against 4, 27 against 16.
 */
import type { Resolved } from "./theme";
import { t } from "./i18n";

export function captionFor(theme: Resolved, pages: number): string {
  const m = theme.page?.margin;
  const size = typeof theme.page?.size === "string" ? theme.page.size : t("info.custom");
  const orientation =
    theme.page?.orientation === "landscape" ? t("info.landscape") : t("info.portrait");
  return [
    size,
    orientation,
    `${t("info.margins")} ${m?.top ?? "?"} ${m?.right ?? "?"} ${m?.bottom ?? "?"} ${m?.left ?? "?"}`,
    theme.cover?.enabled ? t("info.withCover") : t("info.withoutCover"),
    ...(theme.footer?.enabled ? [t("info.withFooter")] : []),
    t("info.pages", { n: pages }),
  ].join(" · ");
}
