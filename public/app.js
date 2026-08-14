/**
 * Player-side glue. Deliberately tiny and build-step free.
 *
 * Rendering lives in the EJS templates only -- after any state change we simply
 * reload rather than re-render in JS, so there is exactly one copy of the markup.
 */
(function () {
  "use strict";

  function showAlert(form, message, kind) {
    var el = form.querySelector(".alert");
    if (!el) return;
    el.textContent = message;
    el.className = "alert " + (kind || "error");
    el.hidden = false;
  }

  function clearAlert(form) {
    var el = form.querySelector(".alert");
    if (el) el.hidden = true;
  }

  function setBusy(form, busy) {
    var button = form.querySelector("button[type=submit]");
    if (button) button.disabled = busy;
    var input = form.querySelector("input[type=file]");
    if (input) input.disabled = busy;
  }

  // ---------------------------------------------------------------- uploads
  // XHR rather than fetch: a 100MB video over pub 4G needs a progress bar,
  // and fetch still has no upload progress event.
  Array.prototype.forEach.call(document.querySelectorAll(".upload-form"), function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearAlert(form);

      var input = form.querySelector("input[type=file]");
      var file = input && input.files && input.files[0];
      if (!file) {
        showAlert(form, "Pick a file first.");
        return;
      }

      var data = new FormData();
      data.append("kind", form.dataset.kind);
      if (form.dataset.sideChallenge) {
        data.append("sideChallengeType", form.dataset.sideChallenge);
      }
      // The device's own file date. Spoofable, but it is the only timestamp we
      // get when iOS strips the embedded metadata.
      data.append("lastModified", String(file.lastModified || ""));
      data.append("media", file);

      var progress = form.querySelector(".progress");
      var bar = form.querySelector(".bar");
      if (progress) progress.hidden = false;
      setBusy(form, true);

      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");

      xhr.upload.addEventListener("progress", function (e) {
        if (!bar || !e.lengthComputable) return;
        var percent = Math.round((e.loaded / e.total) * 100);
        bar.style.width = percent + "%";
        bar.textContent = percent < 100 ? percent + "%" : "Checking...";
      });

      xhr.addEventListener("load", function () {
        setBusy(form, false);
        if (progress) progress.hidden = true;
        if (bar) {
          bar.style.width = "0%";
          bar.textContent = "";
        }

        var body = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch (e) {
          /* fall through to the generic message below */
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          if (body.revealedHint) {
            showAlert(form, "Hint unlocked: " + body.revealedHint, "success");
            setTimeout(function () {
              window.location.reload();
            }, 2500);
          } else {
            window.location.reload();
          }
          return;
        }

        showAlert(form, body.message || "Upload failed. Try again.");
        if (input) input.value = "";
      });

      xhr.addEventListener("error", function () {
        setBusy(form, false);
        if (progress) progress.hidden = true;
        showAlert(form, "Connection dropped. Try again when you have signal.");
      });

      xhr.send(data);
    });
  });

  // ---------------------------------------------------------------- answers
  var answerForm = document.querySelector(".answer-form");
  if (answerForm) {
    answerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      clearAlert(answerForm);

      var input = answerForm.querySelector("input[name=answer]");
      var button = answerForm.querySelector("button[type=submit]");
      if (button) button.disabled = true;

      fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: input ? input.value : "" }),
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (body) {
          if (button) button.disabled = false;
          if (body.correct) {
            showAlert(answerForm, body.successText || "Correct. On you go.", "success");
            setTimeout(function () {
              window.location.reload();
            }, 2000);
          } else {
            showAlert(answerForm, body.message || "Not it.");
            if (input) input.select();
          }
        })
        .catch(function () {
          if (button) button.disabled = false;
          showAlert(answerForm, "Connection dropped. Try again.");
        });
    });
  }

  // ------------------------------------------------------------- team sync
  // Another phone on this team may have uploaded or answered. Poll, and reload
  // when the shared state actually moved.
  if (typeof window.__STATE_SIGNATURE__ === "string") {
    setInterval(function () {
      if (document.hidden) return;
      fetch("/api/state", { headers: { Accept: "application/json" } })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (view) {
          if (!view) return;
          var signature = view.finished
            ? "finished"
            : view.stopNumber + ":" + view.phase + ":" + (view.quiz ? view.quiz.hints.length : 0);
          // Never yank the page out from under someone mid-upload.
          var uploading = document.querySelector(".progress:not([hidden])");
          if (signature !== window.__STATE_SIGNATURE__ && !uploading) {
            window.location.reload();
          }
        })
        .catch(function () {
          /* offline in a basement bar; try again next tick */
        });
    }, 5000);
  }
})();
