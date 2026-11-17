// Tasteloop-Landingpage. Ohne JavaScript ist alles sichtbar und lesbar; dieses Skript
// schaltet nur die Bewegung frei (.js), setzt .in auf sichtbare Blöcke und bedient den Kopieren-Knopf.
(function () {
  var doc = document.documentElement;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 1) Blöcke mit .anim zeichnen sich, sobald sie ins Bild kommen
  var blocks = Array.prototype.slice.call(document.querySelectorAll(".anim"));
  if (!still && "IntersectionObserver" in window) {
    doc.classList.add("js");
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        seen.unobserve(e.target);
      });
    }, { threshold: 0.3, rootMargin: "0px 0px -8% 0px" });
    blocks.forEach(function (b) { seen.observe(b); });
  }

  // 2) Schrittleiste: der Schritt in der Bildmitte wird eingekreist
  var links = {};
  Array.prototype.forEach.call(document.querySelectorAll(".rail a"), function (a) {
    links[a.getAttribute("href").slice(1)] = a;
  });
  if ("IntersectionObserver" in window) {
    var rail = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var a = links[e.target.id];
        if (!a) return;
        a.classList.toggle("on", e.isIntersecting);
        if (e.isIntersecting) a.setAttribute("aria-current", "step");
        else a.removeAttribute("aria-current");
      });
    }, { rootMargin: "-45% 0px -54% 0px" });
    Object.keys(links).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) rail.observe(el);
    });
  }

  // 3) Kopieren-Knopf für den Setup-Prompt. Ohne Zwischenablage bleibt er versteckt, der Prompt ist markierbar.
  if (!navigator.clipboard) return;
  var status = document.getElementById("copy-status");
  Array.prototype.forEach.call(document.querySelectorAll("button.copy"), function (btn) {
    var target = document.getElementById(btn.getAttribute("data-copy"));
    if (!target) return;
    btn.hidden = false;
    btn.addEventListener("click", function () {
      navigator.clipboard.writeText(target.textContent.trim()).then(function () {
        btn.textContent = "Copied";
        if (status) status.textContent = "Prompt copied to clipboard.";
        setTimeout(function () { btn.textContent = "Copy"; }, 2000);
      });
    });
  });
})();
