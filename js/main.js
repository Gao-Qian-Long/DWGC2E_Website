(() => {
  const APP_VERSION = "1.0.0";
  const DOWNLOAD_URL = "https://example.lanzou.com/xxxxx";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* 版本号 / 下载地址 */
  $$("[data-version]").forEach(el => el.textContent = APP_VERSION);
  $$("[data-download]").forEach(el => {
    el.href = DOWNLOAD_URL;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
  });

  /* 头部滚动态（只切 class） */
  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 10);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* 顶部滚动进度 + 回顶部（只切 class / transform） */
  const progressBar = $(".scroll-progress");
  const toTop = $(".to-top");
  let fxQueued = false;
  const updateScrollFX = () => {
    fxQueued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (progressBar) progressBar.style.transform = `scaleX(${ratio})`;
    toTop?.classList.toggle("show", window.scrollY > 600);
  };
  const queueScrollFX = () => {
    if (fxQueued) return;
    fxQueued = true;
    requestAnimationFrame(updateScrollFX);
  };
  window.addEventListener("scroll", queueScrollFX, { passive: true });
  window.addEventListener("resize", queueScrollFX, { passive: true });
  updateScrollFX();
  toTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }));

  /* 跑马灯：补齐偶数份并保证宽度 >= 2 倍视口 */
  const tickerTrack = $(".ticker-track");
  if (tickerTrack) {
    const unit = tickerTrack.innerHTML;
    const unitWidth = Math.max(tickerTrack.scrollWidth, 320);
    const copies = Math.max(2, Math.ceil((window.innerWidth * 2) / unitWidth / 2) * 2);
    tickerTrack.innerHTML = unit.repeat(copies);
  }

  /* 移动端菜单（只切 class） */
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

  /* 入场揭示（只切 class，动画由 CSS 负责） */
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -30px" });
  $$(".reveal").forEach(el => revealObserver.observe(el));

  /* 导航高亮（只切 class） */
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

  /* 数字滚动（一次性，仅写文本） */
  const counters = $$("[data-count]");
  if (counters.length) {
    const animateCount = el => {
      const target = parseFloat(el.dataset.count) || 0;
      const suffix = el.dataset.suffix || "";
      if (reduceMotion) { el.textContent = target + suffix; return; }
      const dur = 1100;
      const t0 = performance.now();
      const tick = now => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      /* 兜底：动画被打断时也落到最终值 */
      setTimeout(() => { el.textContent = target + suffix; }, dur + 250);
    };
    const countObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    counters.forEach(el => countObserver.observe(el));
  }

  /* 效果对比轮播 */
  const carousel = $("#cmpCarousel");
  if (carousel) {
    const track = $(".cmp-track", carousel);
    const slides = $$(".cmp-slide", carousel);
    const dots = $$(".cmp-dot", carousel);
    let index = 0, timer = null;

    const go = i => {
      index = (i + slides.length) % slides.length;
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((d, n) => d.classList.toggle("active", n === index));
      slides.forEach((s, n) => s.setAttribute("aria-hidden", String(n !== index)));
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const play = () => {
      stop();
      if (reduceMotion || slides.length < 2) return;
      timer = setInterval(() => go(index + 1), 5200);
    };

    $(".cmp-prev", carousel)?.addEventListener("click", () => { go(index - 1); play(); });
    $(".cmp-next", carousel)?.addEventListener("click", () => { go(index + 1); play(); });
    dots.forEach((d, n) => d.addEventListener("click", () => { go(n); play(); }));
    carousel.addEventListener("pointerenter", stop);
    carousel.addEventListener("pointerleave", play);

    /* 触摸 / 鼠标横向滑动 */
    let sx = 0, down = false;
    carousel.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      sx = e.clientX; down = true; stop();
    });
    carousel.addEventListener("pointerup", e => {
      if (!down) return;
      down = false;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      play();
    });
    carousel.addEventListener("pointercancel", () => { down = false; play(); });

    go(0);
    play();
    carousel._stop = stop;
  }

  /* 图片灯箱：点击轮播图查看大图 */
  const lightbox = $("#lightbox");
  if (lightbox) {
    const lbImg = lightbox.querySelector("img");
    const closeLb = () => {
      lightbox.classList.remove("show");
      document.body.classList.remove("menu-open");
    };
    $$(".cmp-slide img").forEach(img => {
      img.addEventListener("click", () => {
        lbImg.src = img.currentSrc || img.src;
        lbImg.alt = img.alt;
        lightbox.classList.add("show");
        document.body.classList.add("menu-open");
        carousel?._stop?.();
      });
    });
    lightbox.addEventListener("click", closeLb);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && lightbox.classList.contains("show")) closeLb();
    });
  }

  /* 价格月付 / 年付（只切 class + 写文本） */
  $$("[data-billing]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.billing;
      $$("[data-billing]").forEach(x => x.classList.toggle("active", x === btn));
      $$("[data-price]").forEach(el => { el.textContent = el.dataset[mode]; });
      $$("[data-cycle]").forEach(el => el.textContent = mode === "monthly" ? "/月" : "/年");
    });
  });

  /* FAQ 手风琴（只切 class，展开动画由 CSS 负责） */
  $$(".faq-q").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const open = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
  });

  /* Toast（只切 class） */
  const toast = $(".toast");
  let toastTimer;
  const showToast = msg => {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  };
  $$("[data-toast]").forEach(btn => btn.addEventListener("click", () => showToast(btn.dataset.toast)));

  /* 平滑锚点 */
  $$('a[href^="#"]').forEach(link => {
    link.addEventListener("click", e => {
      const id = link.getAttribute("href");
      if (!id || id === "#") return;
      const target = $(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });
})();
