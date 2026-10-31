/** 由各应用根布局的 next/script 在 hydration 前执行。 */
export const THEME_SCRIPT = `
(() => {
  try {
    const theme = localStorage.getItem("kqa-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    }
  } catch {}
})();
`;
