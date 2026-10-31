// Keep the readable fallback available if the application or one of its chunks cannot load.
void import("./main.tsx").catch((error: unknown) => {
  document.documentElement.dataset.startupFailed = "";
  console.error("Exora could not start its interactive explorer.", error);
});
