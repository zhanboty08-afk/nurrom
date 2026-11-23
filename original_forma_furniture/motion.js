/* ══════════════════════════════════════════════════════════
   NURROOM — Motion Design Controller
   IntersectionObserver scroll-reveal, ripple, parallax,
   scroll progress, stagger assignment
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Respect prefers-reduced-motion ─────────────────── */
  const prefersReduced = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  /* ── 1. Scroll-reveal with IntersectionObserver ─────── */
  function initScrollReveal() {
    /* Tag elements that should animate on scroll */
    const revealMap = [
      { selector: '.section-heading',    cls: 'reveal' },
      { selector: '.section-heading h2', cls: 'reveal' },
      { selector: '.section-heading > p',cls: 'reveal' },
      { selector: '.catalog-tools',      cls: 'reveal' },
      { selector: '.editorial-copy',     cls: 'reveal-left' },
      { selector: '.delivery .kicker',   cls: 'reveal' },
      { selector: '.delivery h2',        cls: 'reveal' },
      { selector: '.faq .kicker',        cls: 'reveal' },
      { selector: '.faq h2',             cls: 'reveal' },
      { selector: '.faq-list',           cls: 'reveal' },
      { selector: '.trust-strip',        cls: '' },      // handled separately
      { selector: 'footer',              cls: '' },      // handled separately
    ];

    revealMap.forEach(({ selector, cls }) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (cls) el.classList.add(cls);
      });
    });

    /* Steps stagger */
    document.querySelectorAll('.steps article').forEach((el, i) => {
      el.classList.add('reveal', `stagger-${i + 1}`);
    });

    if (prefersReduced) {
      /* Immediately show everything */
      document
        .querySelectorAll('.reveal,.reveal-left,.reveal-right,.reveal-scale')
        .forEach((el) => el.classList.add('visible'));
      document
        .querySelectorAll('.trust-strip, footer')
        .forEach((el) => el.classList.add('visible'));
      document
        .querySelectorAll('.section .kicker, .delivery .kicker, .editorial .kicker')
        .forEach((el) => el.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    document
      .querySelectorAll(
        '.reveal, .reveal-left, .reveal-right, .reveal-scale, .trust-strip, footer, .section .kicker, .delivery .kicker, .editorial .kicker'
      )
      .forEach((el) => observer.observe(el));
  }

  /* ── 2. Product card stagger on scroll ─────────────── */
  function initProductStagger() {
    if (prefersReduced) return;

    const grid = document.getElementById('productGrid');
    if (!grid) return;

    const staggerObserver = new MutationObserver(() => {
      const cards = grid.querySelectorAll('.product-card:not(.reveal)');
      cards.forEach((card, i) => {
        card.classList.add('reveal', `stagger-${Math.min(i % 9 + 1, 9)}`);
      });

      const cardObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
              cardObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08, rootMargin: '0px 0px -20px 0px' }
      );

      cards.forEach((card) => cardObserver.observe(card));
    });

    staggerObserver.observe(grid, { childList: true });
  }

  /* ── 3. Button ripple effect ───────────────────────── */
  function initRipple() {
    if (prefersReduced) return;

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.primary-btn, .outline-btn');
      if (!btn) return;

      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = e.clientX - rect.left - size / 2 + 'px';
      ripple.style.top = e.clientY - rect.top - size / 2 + 'px';
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }

  /* ── 4. Scroll progress bar in header ──────────────── */
  function initScrollProgress() {
    if (prefersReduced) return;

    const header = document.querySelector('.header');
    if (!header) return;

    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            const scrollTop = window.scrollY;
            const docHeight =
              document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
            header.style.setProperty(
              '--scroll-progress',
              Math.min(progress, 100) + '%'
            );
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true }
    );
  }

  /* ── 5. Smooth parallax on hero image ──────────────── */
  function initHeroParallax() {
    if (prefersReduced) return;

    const heroImg = document.querySelector('.hero-visual img');
    if (!heroImg) return;

    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            const scrollY = window.scrollY;
            const speed = 0.12;
            const yOffset = scrollY * speed;
            /* Combine parallax with the floating animation */
            heroImg.style.transform = `translateY(${yOffset}px)`;
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true }
    );
  }

  /* ── 6. Nav link active tracking ───────────────────── */
  function initActiveNav() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('#siteNav a[href^="#"]');
    if (!sections.length || !navLinks.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navLinks.forEach((link) => {
              link.style.color =
                link.getAttribute('href') === `#${id}`
                  ? 'var(--ink)'
                  : '';
              link.style.fontWeight =
                link.getAttribute('href') === `#${id}` ? '600' : '';
            });
          }
        });
      },
      { threshold: 0.3, rootMargin: '-80px 0px -40% 0px' }
    );

    sections.forEach((section) => observer.observe(section));
  }

  /* ── 7. Tilt effect on product cards (desktop) ─────── */
  function initCardTilt() {
    if (prefersReduced) return;
    if (!window.matchMedia('(hover: hover)').matches) return;

    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest('.product-card');
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `
        translateY(-6px) 
        perspective(600px) 
        rotateY(${x * 4}deg) 
        rotateX(${-y * 3}deg)
      `;
    });

    document.addEventListener('mouseleave', (e) => {
      const card = e.target.closest('.product-card');
      if (card) {
        card.style.transform = '';
      }
    }, true);
  }

  /* ── 8. Smooth number count for trust-strip ────────── */
  function initCountUp() {
    if (prefersReduced) return;

    /* This is cosmetic — no numbers to count in current trust-strip,
       but the observer for visibility is reused */
  }

  /* ── Init everything after DOM ready ───────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    initScrollReveal();
    initProductStagger();
    initRipple();
    initScrollProgress();
    initHeroParallax();
    initActiveNav();
    initCardTilt();
  }
})();
