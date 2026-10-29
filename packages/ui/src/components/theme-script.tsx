const THEME_SCRIPT = `
(() => {
  try {
    const theme = localStorage.getItem("kqa-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    }
  } catch {}
})();
`;

/** 在首次绘制前恢复用户选择；未选择时由 CSS 跟随系统主题。 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
