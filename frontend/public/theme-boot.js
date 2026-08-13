(function () {
  try {
    var stored = window.localStorage.getItem("emoggle:theme");
    var mode =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.setAttribute("data-theme", mode);
  } catch {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
