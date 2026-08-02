"use strict";

(() => {
  const sources = [
    "https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js",
    "https://unpkg.com/upng-js@2.1.0/UPNG.js"
  ];

  function load(index) {
    if (globalThis.UPNG?.encode || index >= sources.length) return;

    const script = document.createElement("script");
    script.src = sources[index];
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (!globalThis.UPNG?.encode) load(index + 1);
    };
    script.onerror = () => load(index + 1);
    document.head.append(script);
  }

  load(0);
})();
