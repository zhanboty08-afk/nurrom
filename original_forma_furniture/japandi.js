/* ==========================================================================
   NURROOM — Gentle Japandi Micro-Interactions
   Zero-conflict: cart counter pulse + soft scroll reveal
   ========================================================================== */
(function () {
  "use strict";

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  /* 1. Soft tactile pulse on cart button whenever cartCount changes */
  const cartCount = document.getElementById("cartCount");
  const cartBtn = document.getElementById("openCart");

  if (cartCount && cartBtn && !reducedMotion) {
    let prevValue = cartCount.textContent;
    const countObserver = new MutationObserver(() => {
      const nextValue = cartCount.textContent;
      if (nextValue === prevValue) return;
      prevValue = nextValue;
      cartBtn.classList.remove("cart-bump");
      void cartBtn.offsetWidth;
      cartBtn.classList.add("cart-bump");
    });
    countObserver.observe(cartCount, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    cartBtn.addEventListener("animationend", () => {
      cartBtn.classList.remove("cart-bump");
    });
  }

  /* 2. Calm, unobtrusive section entrance on scroll */
  if (reducedMotion || !("IntersectionObserver" in window)) return;

  const revealTargets = document.querySelectorAll("[data-reveal]");
  if (!revealTargets.length) return;

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          entry.target.classList.remove("reveal-ready");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -24px 0px" },
  );

  revealTargets.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) {
      el.classList.add("is-revealed");
    } else {
      el.classList.add("reveal-ready");
      revealObserver.observe(el);
    }
  });
})();
