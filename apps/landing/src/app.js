// Kopieren-Knopf für den Setup-Prompt. Ohne JavaScript bleibt der Knopf versteckt, der Prompt ist markierbar.
(function () {
  if (!navigator.clipboard) return;
  var status = document.getElementById("copy-status");
  document.querySelectorAll("button.copy").forEach(function (btn) {
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
