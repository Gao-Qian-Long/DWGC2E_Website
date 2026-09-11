(() => {
  const APP_VERSION = "1.0.0";
  const DOWNLOAD_URL = "https://example.lanzou.com/xxxxx";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  $$("[data-version]").forEach(el => el.textContent = APP_VERSION);
  $$("[data-download]").forEach(el => {
    el.href = DOWNLOAD_URL;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  });

  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 10);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const menuBtn = $(".menu-btn");
  const mobileNav = $(".mobile-nav");
  menuBtn?.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
    mobileNav.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("menu-open", open);
  });
  $$(".mobile-nav a").forEach(a => a.addEventListener("click", () => {
    mobileNav.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
    mobileNav.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-open");
  }));

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -30px" });
  $$(".reveal,.workflow-track").forEach(el => revealObserver.observe(el));

  const sections = $$("main section[id]");
  const navLinks = $$(".desktop-nav a");
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => {
        link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`);
      });
    });
  }, { rootMargin: "-35% 0px -55% 0px" });
  sections.forEach(section => sectionObserver.observe(section));

  if (window.matchMedia("(pointer:fine)").matches) {
    window.addEventListener("pointermove", e => {
      document.documentElement.style.setProperty("--mx", `${e.clientX}px`);
      document.documentElement.style.setProperty("--my", `${e.clientY}px`);
    }, { passive: true });

    $$("[data-tilt]").forEach(card => {
      card.addEventListener("pointermove", e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.setProperty("--cx", `${x * 100}%`);
        card.style.setProperty("--cy", `${y * 100}%`);

        const hero = card.classList.contains("hero-visual");
        if (hero) {
          const ry = (x - .5) * 5;
          const rx = (.5 - y) * 4;
          $(".hero-app", card).style.transform = `rotateX(${rx}deg) rotateY(${ry - 3}deg)`;
        }
      });
      card.addEventListener("pointerleave", () => {
        const heroApp = $(".hero-app", card);
        if (heroApp) heroApp.style.transform = "";
      });
    });

    $$(".magnetic").forEach(btn => {
      btn.addEventListener("pointermove", e => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * .12;
        const y = (e.clientY - (r.top + r.height / 2)) * .12;
        btn.style.transform = `translate(${x}px,${y}px) translateY(-2px)`;
      });
      btn.addEventListener("pointerleave", () => btn.style.transform = "");
    });
  }

  $$(".screen-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const id = tab.dataset.screen;
      $$(".screen-tab").forEach(x => x.classList.toggle("active", x === tab));
      $$(".screen-panel").forEach(panel => panel.classList.toggle("active", panel.dataset.screenPanel === id));
    });
  });

  $$("[data-billing]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.billing;
      $$("[data-billing]").forEach(x => x.classList.toggle("active", x === btn));
      $$("[data-price]").forEach(el => {
        el.animate([{ opacity: .25, transform: "translateY(5px)" }, { opacity: 1, transform: "none" }], { duration: 260 });
        el.textContent = el.dataset[mode];
      });
      $$("[data-cycle]").forEach(el => el.textContent = mode === "monthly" ? "/月" : "/年");
    });
  });

  $$(".faq-q").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const open = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
  });

  const toast = $(".toast");
  let toastTimer;
  const showToast = msg => {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  };
  $$("[data-toast]").forEach(btn => btn.addEventListener("click", () => showToast(btn.dataset.toast)));

  $$('a[href^="#"]').forEach(link => {
    link.addEventListener("click", e => {
      const id = link.getAttribute("href");
      if (!id || id === "#") return;
      const target = $(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
})();
