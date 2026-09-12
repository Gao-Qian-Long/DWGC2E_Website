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

  /* 头部滚动态 */
  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 10);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* 顶部滚动进度 + 回顶部 */
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

  /* 移动端菜单 */
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

  /* 入场揭示 */
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -30px" });
  $$(".reveal").forEach(el => revealObserver.observe(el));

  /* 导航高亮 */
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

  /* 数字滚动 */
  const counters = $$("[data-count]");
  if (counters.length) {
    const animateCount = el => {
      const target = parseFloat(el.dataset.count) || 0;
      const suffix = el.dataset.suffix || "";
      if (reduceMotion) { el.textContent = target + suffix; return; }
      const dur = 1400;
      const t0 = performance.now();
      const tick = now => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
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

  /* AI 打字机（Bento 主卡） */
  const typeText = $("#typeText");
  const typeSrc = $("#typeSrc");
  if (typeText && typeSrc) {
    const pairs = [
      ["MOTOR BRACKET", "电机支架"],
      ["MATERIAL: SUS304", "材料：SUS304"],
      ["SURFACE ROUGHNESS: Ra 1.6", "表面粗糙度：Ra 1.6"],
      ["DO NOT SCALE DRAWING", "禁止按图纸比例测量"]
    ];
    let pi = 0, ci = 0, deleting = false;
    const step = () => {
      const [src, out] = pairs[pi];
      typeSrc.textContent = src;
      if (!deleting) {
        ci++;
        typeText.textContent = out.slice(0, ci);
        if (ci >= out.length) { deleting = true; return setTimeout(step, 1600); }
        return setTimeout(step, 70 + Math.random() * 60);
      }
      ci--;
      typeText.textContent = out.slice(0, ci);
      if (ci <= 0) { deleting = false; pi = (pi + 1) % pairs.length; return setTimeout(step, 500); }
      return setTimeout(step, 34);
    };
    if (reduceMotion) { typeSrc.textContent = pairs[0][0]; typeText.textContent = pairs[0][1]; }
    else step();
  }

  /* 独家迭代算法演示：检测干涉 -> 迭代收敛字高 -> 适配完成 */
  const algo = $("#algoDemo");
  if (algo) {
    const frame = $(".algo-frame", algo);
    const label = $("#algoLabel");
    const stateEl = $("#algoState");
    const sizeEl = $("#algoSize");
    const meter = $("#algoMeter");
    const cases = [
      ["MOTOR BRACKET", 24, 13],
      ["GENERAL TOLERANCE ±0.05", 21, 11],
      ["SURFACE ROUGHNESS Ra 1.6", 21, 11]
    ];
    const paint = (px, h) => {
      label.style.fontSize = px.toFixed(1) + "px";
      sizeEl.textContent = "字高 " + h.toFixed(2);
    };
    if (reduceMotion) {
      algo.classList.add("ok");
      stateEl.textContent = "干涉已消除 · 保持可读";
      paint(cases[0][2], cases[0][2] / 7);
    } else {
      let i = 0;
      const run = () => {
        const [text, from, to] = cases[i];
        const scale = Math.min(1, (frame.clientWidth || 360) / 360) || 1;
        const f = from * scale, t = to * scale;
        label.textContent = text;
        algo.classList.remove("ok");
        algo.classList.add("detect");
        stateEl.textContent = "检测到文字 / 图层干涉";
        meter.style.width = "18%";
        paint(f, f / 7);
        const steps = 6;
        let s = 0;
        const iterate = () => {
          s++;
          const v = f + (t - f) * (s / steps);
          paint(v, v / 7);
          meter.style.width = (18 + (s / steps) * 82).toFixed(0) + "%";
          if (s < steps) { setTimeout(iterate, 250); return; }
          algo.classList.remove("detect");
          algo.classList.add("ok");
          stateEl.textContent = "干涉已消除 · 保持可读";
          setTimeout(() => { i = (i + 1) % cases.length; run(); }, 1900);
        };
        setTimeout(iterate, 850);
      };
      run();
    }
  }

  /* 粒子网络背景 */
  const canvas = $(".fx-canvas");
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext("2d");
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, pts = [];
    const mouse = { x: -9999, y: -9999 };
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * DPR; canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    const build = () => {
      const n = Math.max(36, Math.min(90, Math.floor((w * h) / 16000)));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - .5) * .45, vy: (Math.random() - .5) * .45,
        r: Math.random() * 1.6 + .6
      }));
    };
    resize(); build();
    window.addEventListener("resize", () => { resize(); build(); }, { passive: true });
    window.addEventListener("pointermove", e => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
    }, { passive: true });
    window.addEventListener("pointerleave", () => { mouse.x = -9999; mouse.y = -9999; });
    const LINK = 130, MOUSE = 170;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20;
        const dxm = p.x - mouse.x, dym = p.y - mouse.y;
        const dm = Math.hypot(dxm, dym);
        if (dm < MOUSE && dm > 0.01) { p.x += (dxm / dm) * .8; p.y += (dym / dm) * .8; }
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(96,165,250,${(1 - d / LINK) * .35})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        const glow = Math.hypot(p.x - mouse.x, p.y - mouse.y) < MOUSE;
        ctx.fillStyle = glow ? "rgba(34,211,238,.95)" : "rgba(120,170,255,.75)";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (glow ? .8 : 0), 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    draw();
  }

  /* 指针特效（桌面 + 非降级） */
  if (!reduceMotion && window.matchMedia("(pointer:fine)").matches) {
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
        const rx = (.5 - y) * (card.classList.contains("hero-visual") ? 4 : 7);
        const ry = (x - .5) * (card.classList.contains("hero-visual") ? 5 : 8);
        const target = card.classList.contains("hero-visual") ? $(".hero-app", card) : card;
        if (target) target.style.transform = card.classList.contains("hero-visual")
          ? `rotateX(${rx}deg) rotateY(${ry - 4}deg)`
          : `perspective(900px) translateY(-4px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      });
      card.addEventListener("pointerleave", () => {
        const target = card.classList.contains("hero-visual") ? $(".hero-app", card) : card;
        if (target) target.style.transform = "";
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

  /* 价格月付 / 年付 */
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

  /* FAQ 手风琴 */
  $$(".faq-q").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const open = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
  });

  /* Toast */
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
