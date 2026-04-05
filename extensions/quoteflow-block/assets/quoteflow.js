(function () {
  "use strict";

  var API_BASE = "/apps/quoteflow";

  // --- Modal ---
  function openModal(productId, productTitle, variantId, quantity) {
    var modal = document.getElementById("qf-modal");
    if (!modal) return;
    modal.style.display = "flex";
    document.getElementById("qf-product-id").value = productId || "";
    document.getElementById("qf-variant-id").value = variantId || "";
    document.getElementById("qf-product-title").value = productTitle || "";
    var qtyField = document.getElementById("qf-quantity");
    if (qtyField && quantity) qtyField.value = quantity;
    var productInfo = document.getElementById("qf-form-product");
    if (productInfo) productInfo.textContent = productTitle ? "Product: " + productTitle : "";
    document.getElementById("qf-form-error").style.display = "none";
    document.getElementById("qf-form-success").style.display = "none";
    document.getElementById("qf-submit").style.display = "block";
    document.getElementById("qf-form").reset();
    if (qtyField && quantity) qtyField.value = quantity;
    modal.querySelector("input:not([type=hidden])").focus();
  }

  function closeModal() {
    var modal = document.getElementById("qf-modal");
    if (modal) modal.style.display = "none";
  }

  // --- Form Submit ---
  function initForm() {
    var form = document.getElementById("qf-form");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var errorEl = document.getElementById("qf-form-error");
      var successEl = document.getElementById("qf-form-success");
      var submitBtn = document.getElementById("qf-submit");

      // Validate
      var email = form.querySelector('[name="email"]').value;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorEl.textContent = "Please enter a valid email address";
        errorEl.style.display = "block";
        return;
      }
      var consent = form.querySelector('[name="gdprConsent"]');
      if (consent && !consent.checked) {
        errorEl.textContent = "Please agree to be contacted about your quote";
        errorEl.style.display = "block";
        return;
      }

      errorEl.style.display = "none";
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";

      var formData = new FormData(form);
      var body = {};
      formData.forEach(function (val, key) { body[key] = val; });
      // Include basket items if present
      var basketItems = window.QFBasket ? window.QFBasket.getItems() : [];
      if (basketItems.length > 0) body.products = JSON.stringify(basketItems);
      else body.products = JSON.stringify([{ id: body.productId, title: body.productTitle, quantity: body.quantity || 1 }]);

      fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
        .then(function (result) {
          if (result.ok) {
            successEl.style.display = "block";
            submitBtn.style.display = "none";
            if (window.QFBasket) window.QFBasket.clear();
          } else {
            errorEl.textContent = result.data.error || "Something went wrong — please try again";
            errorEl.style.display = "block";
            submitBtn.disabled = false;
            submitBtn.textContent = "Send Quote Request";
          }
        })
        .catch(function () {
          errorEl.textContent = "Something went wrong — please try again or contact us directly";
          errorEl.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "Send Quote Request";
        });
    });
  }

  // --- Quote Basket (Collection Pages) ---
  window.QFBasket = {
    KEY: "qf_basket",
    getItems: function () {
      try { return JSON.parse(localStorage.getItem(this.KEY) || "[]"); } catch { return []; }
    },
    add: function (productId, productTitle) {
      var items = this.getItems();
      if (!items.find(function (i) { return i.id === productId; })) {
        items.push({ id: productId, title: productTitle, quantity: 1 });
        localStorage.setItem(this.KEY, JSON.stringify(items));
      }
      this.updateUI();
    },
    clear: function () {
      localStorage.removeItem(this.KEY);
      this.updateUI();
    },
    updateUI: function () {
      var basket = document.getElementById("qf-basket");
      if (!basket) return;
      var items = this.getItems();
      var countEl = basket.querySelector(".qf-basket__count");
      if (countEl) countEl.textContent = items.length;
      basket.style.display = items.length > 0 ? "block" : "none";
    },
  };

  // --- Init ---
  function init() {
    // Open modal buttons
    document.querySelectorAll("[data-qf-open-form]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var wrap = btn.closest("[data-product-id]") || btn.closest(".qf-button-wrap");
        var pid = wrap ? wrap.dataset.productId : "";
        var title = wrap ? wrap.dataset.productTitle : "";
        var vid = wrap ? wrap.dataset.variantId : "";
        var qtyInput = wrap ? wrap.querySelector(".qf-qty-input") : null;
        var qty = qtyInput ? qtyInput.value : "1";
        openModal(pid, title, vid, qty);
      });
    });

    // Close modal
    document.querySelectorAll("[data-qf-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

    // Basket submit
    var basketSubmit = document.getElementById("qf-basket-submit");
    if (basketSubmit) {
      basketSubmit.addEventListener("click", function () {
        openModal("", "Multiple Products", "", "");
      });
    }

    initForm();
    window.QFBasket.updateUI();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
