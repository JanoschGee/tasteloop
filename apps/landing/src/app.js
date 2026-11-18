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
  Array.prototype.forEach.call(document.querySelectorAll(".rail li:not(.rail-loop) a"), function (a) {
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

  // 3) Anmeldeformular: ohne JavaScript ein normales POST mit Weiterleitung, hier mit fetch und Meldung an Ort und Stelle
  var gate = document.getElementById("gate");
  var gateStatus = document.getElementById("gate-status");
  if (gate && gateStatus && window.fetch && window.URLSearchParams && window.FormData) {
    gate.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var btn = gate.querySelector("button[type=submit]");
      if (btn.disabled) return;
      btn.disabled = true;
      gateStatus.className = "gate-status";
      gateStatus.textContent = "Sending…";
      var fail = function (msg) {
        btn.disabled = false;
        gateStatus.className = "gate-status err";
        gateStatus.textContent = msg || "That didn't work. Please try again in a moment.";
      };
      fetch(gate.getAttribute("action"), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(new FormData(gate)).toString(),
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) return fail(data.message);
          gate.classList.add("sent");
          gateStatus.textContent = data.message;
        });
      }).catch(function () { fail(); });
    });
  }

  // 4) Kopieren-Knopf für den Setup-Prompt (Seite /welcome). Ohne Zwischenablage bleibt er versteckt, der Prompt ist markierbar.
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
