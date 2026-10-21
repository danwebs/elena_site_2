/* =====================================================================
   Логика сайта. Без сторонних библиотек.
   Безопасность: весь динамический контент создаётся через
   createElement/textContent (без innerHTML) — защита от XSS.
   ===================================================================== */
(function () {
  "use strict";

  // Защита от встраивания сайта в чужие фреймы (кликджекинг)
  if (window.top !== window.self) {
    try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.textContent = ""; }
    return;
  }

  document.documentElement.classList.add("js");
  var D = window.SITE_DATA || { STYLES: {}, QUIZ: [], PROJECTS: [] };

  /* ---------- Утилиты ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var SAFE_IMG = /^assets\/img\/[a-z0-9\-_\/]+\.(jpe?g|png|webp|avif)$/i;
  function safeSrc(src) { return SAFE_IMG.test(src) ? src : "assets/img/hero.jpg"; }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function styleName(key) { return D.STYLES[key] ? D.STYLES[key].name : ""; }

  /* ---------- Шапка и меню ---------- */
  var header = $(".header"), burger = $(".burger"), nav = $("#nav");
  var MENU_CLOSE_MS = 300;   /* совпадает с длительностью закрытия меню в CSS */
  function onScroll() { header.classList.toggle("is-scrolled", window.scrollY > 40); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  function setMenu(open) {
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
  }
  burger.addEventListener("click", function () { setMenu(burger.getAttribute("aria-expanded") !== "true"); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { setMenu(false); setFab(false); } });
  /* Клик по затемнению под меню тоже его закрывает */
  document.addEventListener("click", function (e) {
    if (!document.body.classList.contains("menu-open")) return;
    if (e.target.closest(".nav") || e.target.closest(".burger")) return;
    setMenu(false);
  });

  /* ---------- Плавная прокрутка по внутренним ссылкам ----------
     Собственная анимация вместо встроенной CSS-плавности: все переходы
     (логотип, пункты меню, кнопки) идут одинаково — с одной длительностью
     и кривой ускорения. */
  var HEADER_OFFSET = 88;   /* совпадает с scroll-padding-top в style.css */
  var scrollState = null;

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function stopScrollAnim() {
    if (!scrollState) return;
    cancelAnimationFrame(scrollState.raf);
    clearInterval(scrollState.timer);
    scrollState.root.style.scrollBehavior = scrollState.prev;
    scrollState = null;
  }

  /* Прокрутка к цели с плавной анимацией.
     target — либо координата, либо функция, возвращающая актуальную
     координату: цель пересчитывается каждый кадр, поэтому сдвиг раскладки
     (content-visibility, догрузка картинок) не сбивает посадку на секцию. */
  function animateScrollTo(target, onDone) {
    stopScrollAnim();
    var root = document.documentElement;
    var prev = root.style.scrollBehavior;
    /* Отключаем CSS-сглаживание: пока идёт наша анимация, каждый вызов
       scrollTo иначе запускал бы ещё одну плавную прокрутку. Заодно это
       прерывает нативную прокрутку, если она шла. */
    root.style.scrollBehavior = "auto";
    function targetY() {
      var y = typeof target === "function" ? target() : target;
      var maxY = Math.max(0, root.scrollHeight - window.innerHeight);
      return Math.min(Math.max(y, 0), maxY);
    }
    var startY = window.pageYOffset || root.scrollTop;
    var endY = targetY();
    window.scrollTo(0, startY);   /* фиксируем текущую точку, отменяя нативную прокрутку */
    if (reducedMotion() || Math.abs(endY - startY) < 2) {
      window.scrollTo(0, endY);
      root.style.scrollBehavior = prev;
      updateToTop();
      if (onDone) onDone();
      return;
    }
    var duration = Math.min(1100, Math.max(420, Math.abs(endY - startY) * 0.35));
    var startTime = null;
    var state = { raf: 0, timer: 0, root: root, prev: prev };
    scrollState = state;
    /* Кадры берём из requestAnimationFrame, но страхуемся таймером:
       в фоновой вкладке браузер кадры приостанавливает, и без страховки
       переход просто не начался бы.
       Время везде берём из performance.now(): у requestAnimationFrame
       таймстемп — тоже performance.now(), а Date.now() отсчитывает от
       эпохи и смешивать их нельзя.
       Таймер один на всю анимацию, а не на каждый кадр: новый setTimeout
       в каждом шаге накапливал бы вызовы и ломал расчёт прогресса. */
    function schedule() {
      state.raf = requestAnimationFrame(step);
      if (!state.timer) {
        state.timer = setInterval(function () {
          if (scrollState !== state) { clearInterval(state.timer); state.timer = 0; return; }
          step(performance.now());
        }, 40);
      }
    }
    function step(ts) {
      if (scrollState !== state) return;
      if (startTime === null) startTime = ts;
      var p = Math.min(1, (ts - startTime) / duration);
      var eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      var dest = targetY();
      window.scrollTo(0, Math.round(startY + (dest - startY) * eased));
      updateToTop();   /* состояние кнопки «Наверх» — по ходу анимации */
      if (p < 1) { schedule(); }
      else {
        cancelAnimationFrame(state.raf);
        clearInterval(state.timer);
        state.timer = 0;
        scrollState = null;
        root.style.scrollBehavior = prev;
        updateToTop();
        if (onDone) onDone();
      }
    }
    schedule();
  }

  /* Прокрутка к секции с отступом под закреплённую шапку. Позиция берётся
     из секции в каждом кадре, поэтому присадочная точка всегда актуальна. */
  function scrollToSection(el, offset) {
    if (!el) return;
    var off = offset;
    if (off === undefined) {
      var m = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      off = Math.max(HEADER_OFFSET, m);
    }
    animateScrollTo(function () {
      return el.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop) - off;
    });
  }

  /* Клик по любой внутренней ссылке: логотип, пункты меню, кнопки. */
  $$('a[href^="#"]').forEach(function (a) {
    if (a.classList.contains("skip")) return;   /* «Перейти к содержанию» — без анимации */
    a.addEventListener("click", function (e) {
      var hash = a.getAttribute("href");
      if (!hash || hash === "#") return;
      var id = hash.slice(1);
      var target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      function go() {
        if (id === "top") {
          /* Якорь #top не срабатывает: заголовок закреплён (position: fixed),
             и браузер не меняет позицию прокрутки. Поэтому прокручиваем сами. */
          animateScrollTo(0);
          if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
        } else {
          scrollToSection(target);
          if (history.replaceState) {
            var same = location.hash === hash;
            history[same ? "replaceState" : "pushState"](null, "", same ? location.pathname + location.search : hash);
          }
        }
      }
      /* Пункт открытого мобильного меню: сначала плавно закрываем меню,
         и только после этого переходим к разделу. */
      if (nav.contains(a) && nav.classList.contains("is-open")) {
        setMenu(false);
        setTimeout(go, MENU_CLOSE_MS);
      } else {
        go();
      }
    });
  });

  /* Пользователь перехватывает прокрутку — останавливаем анимацию. */
  ["wheel", "touchstart"].forEach(function (ev) {
    window.addEventListener(ev, stopScrollAnim, { passive: true });
  });

  /* ---------- Кнопка «Наверх» ----------
     Показывается, когда страница прокручена вниз, и поднимает её наверх
     той же анимацией, что и логотип в шапке. */
  var toTop = $(".to-top");
  function updateToTop() {
    if (toTop) toTop.classList.toggle("is-visible", window.scrollY > 400);
  }
  if (toTop) {
    toTop.addEventListener("click", function () {
      animateScrollTo(0);
      if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    });
    window.addEventListener("scroll", updateToTop, { passive: true });
    updateToTop();
  }

  var year = $("#year"); if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Появление блоков ---------- */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    $$(".reveal").forEach(function (n) { io.observe(n); });
  } else { $$(".reveal").forEach(function (n) { n.classList.add("is-in"); }); }

  /* ---------- Портфолио ---------- */
  var grid = $("#grid"), filters = $("#filters"), current = "all";
  function renderFilters() {
    var keys = ["all"].concat(Object.keys(D.STYLES));
    keys.forEach(function (k) {
      filters.appendChild(el("button", {
        class: "chip", type: "button", "aria-pressed": String(k === current), "data-style": k,
        text: k === "all" ? "Все проекты" : styleName(k),
        onclick: function () { setFilter(k); }
      }));
    });
  }
  function setFilter(k) {
    current = k;
    $$(".chip", filters).forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-style") === k)); });
    renderGrid();
  }
  function renderGrid() {
    clear(grid);
    var list = D.PROJECTS.filter(function (p) { return current === "all" || p.style === current; });
    if (!list.length) { grid.appendChild(el("p", { class: "empty", text: "Проекты в этом стиле скоро появятся. Хотите стать первым? Напишите мне!" })); return; }
    list.forEach(function (p) {
      grid.appendChild(el("button", { class: "card", type: "button", "aria-label": "Открыть проект «" + p.title + "»", onclick: function () { openProject(p); } }, [
        el("div", { class: "card__img" }, [
          el("img", { src: safeSrc(p.images[0]), alt: p.title, loading: "lazy", width: "600", height: "750" }),
          el("span", { class: "card__tag", text: p.kind })
        ]),
        el("div", { class: "card__body" }, [
          el("span", { class: "card__title", text: p.title }),
          el("span", { class: "card__meta", text: p.area + " · " + styleName(p.style) })
        ])
      ]));
    });
  }
  if (grid && filters) { renderFilters(); renderGrid(); }

  /* ---------- Модальное окно проекта ---------- */
  var modal = $("#modal"), mImg = $("#modal-img"), mThumbs = $("#modal-thumbs"), gal = [], gi = 0, lastFocus = null;
  function showImg(i) {
    gi = (i + gal.length) % gal.length;
    mImg.src = safeSrc(gal[gi]);
    $$("button", mThumbs).forEach(function (b, j) { b.setAttribute("aria-current", String(j === gi)); });
  }
  function openProject(p) {
    lastFocus = document.activeElement;
    gal = p.images.slice();
    $("#modal-kind").textContent = p.kind;
    $("#modal-title").textContent = p.title;
    $("#modal-area").textContent = p.area;
    $("#modal-term").textContent = p.term;
    $("#modal-style").textContent = styleName(p.style);
    $("#modal-city").textContent = p.city;
    $("#modal-task").textContent = p.task;
    $("#modal-solution").textContent = p.solution;
    mImg.alt = p.title;
    clear(mThumbs);
    gal.forEach(function (src, i) {
      mThumbs.appendChild(el("button", { type: "button", "aria-label": "Фото " + (i + 1), onclick: function () { showImg(i); } }, [el("img", { src: safeSrc(src), alt: "" })]));
    });
    $$(".modal__nav").forEach(function (b) { b.hidden = gal.length < 2; });
    mThumbs.hidden = gal.length < 2;
    showImg(0);
    if (typeof modal.showModal === "function") modal.showModal(); else modal.setAttribute("open", "");
  }
  function closeModal() { if (modal.open) { modal.close ? modal.close() : modal.removeAttribute("open"); } }
  if (modal) {
    modal.addEventListener("close", function () { if (lastFocus) lastFocus.focus(); });
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    $$("[data-close]", modal).forEach(function (b) { b.addEventListener("click", closeModal); });
    $$("[data-step]", modal).forEach(function (b) { b.addEventListener("click", function () { showImg(gi + Number(b.getAttribute("data-step"))); }); });
    modal.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" && gal.length > 1) showImg(gi + 1);
      if (e.key === "ArrowLeft" && gal.length > 1) showImg(gi - 1);
    });
  }

  /* ---------- До / после ---------- */
  var cmp = $("#compare-box"), range = $("#compare-range");
  if (cmp && range) {
    var upd = function () { cmp.style.setProperty("--pos", Math.min(100, Math.max(0, Number(range.value))) + "%"); };
    range.addEventListener("input", upd); upd();
  }

  /* ---------- Тест стиля ---------- */
  var qBody = $("#quiz-body"), qBar = $("#quiz-bar"), qStep = $("#quiz-step"), answers = [], qi = 0;
  var intro = qBody ? qBody.firstElementChild.cloneNode(true) : null;
  if (qBody) qBody.addEventListener("click", function (e) {
    if (e.target.closest("#quiz-start")) { answers = []; qi = 0; renderQ(); }
  });

  function renderQ() {
    var item = D.QUIZ[qi];
    clear(qBody);
    qStep.textContent = "Вопрос " + (qi + 1) + " из " + D.QUIZ.length;
    qBar.style.width = Math.round((qi / D.QUIZ.length) * 100) + "%";
    var opts = el("div", { class: "options", role: "group", "aria-label": item.q });
    item.a.forEach(function (a, j) {
      opts.appendChild(el("button", {
        class: "option", type: "button", "aria-pressed": String(answers[qi] === j),
        onclick: function () { answers[qi] = j; next.disabled = false; $$(".option", opts).forEach(function (b, k) { b.setAttribute("aria-pressed", String(k === j)); }); }
      }, [el("span", { class: "option__mark", "aria-hidden": "true" }), el("span", { text: a[0] })]));
    });
    var back = el("button", { class: "btn btn--ghost", type: "button", text: qi === 0 ? "В начало" : "← Назад",
      onclick: function () { if (qi === 0) { resetQuiz(); } else { qi--; renderQ(); } } });
    var next = el("button", { class: "btn btn--fill", type: "button", text: qi === D.QUIZ.length - 1 ? "Узнать результат" : "Далее →",
      onclick: function () { if (answers[qi] == null) return; if (qi < D.QUIZ.length - 1) { qi++; renderQ(); } else { renderResult(); } } });
    next.disabled = answers[qi] == null;
    qBody.appendChild(el("h3", { class: "quiz__q", text: item.q }));
    qBody.appendChild(opts);
    qBody.appendChild(el("div", { class: "quiz__foot" }, [back, next]));
    qBody.focus({ preventScroll: true });
    scrollQuiz();
  }
  function scrollQuiz() {
    var top = $("#quiz-box").getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.4) scrollToSection($("#quiz-box"), 96);
  }
  function calc() {
    var score = {}, order = Object.keys(D.STYLES);
    order.forEach(function (k) { score[k] = 0; });
    answers.forEach(function (j, i) {
      var s = D.QUIZ[i].a[j][1];
      Object.keys(s).forEach(function (k) { if (k in score) score[k] += s[k]; });
    });
    // При равенстве баллов побеждает стиль из последнего «решающего» ответа
    var best = order[0];
    order.forEach(function (k) { if (score[k] > score[best]) best = k; });
    var ties = order.filter(function (k) { return score[k] === score[best]; });
    if (ties.length > 1) {
      for (var i = answers.length - 1; i >= 0; i--) {
        var s = D.QUIZ[i].a[answers[i]][1], hit = ties.filter(function (k) { return s[k]; });
        if (hit.length) { best = hit[0]; break; }
      }
    }
    return best;
  }
  function renderResult() {
    var key = calc(), st = D.STYLES[key];
    clear(qBody);
    qStep.textContent = "Ваш результат";
    qBar.style.width = "100%";
    var pal = el("div", { class: "palette" });
    st.palette.forEach(function (c) {
      var sw = el("div", { class: "swatch__c" });
      if (/^#[0-9a-f]{6}$/i.test(c[1])) sw.style.backgroundColor = c[1];
      pal.appendChild(el("div", { class: "swatch" }, [sw, el("div", { class: "swatch__n", text: c[0] }), el("div", { class: "swatch__h", text: c[1].toUpperCase() })]));
    });
    function list(arr) { var u = el("ul", { class: "ideas" }); arr.forEach(function (t) { u.appendChild(el("li", { text: t })); }); return u; }
    qBody.appendChild(el("div", { class: "result" }, [
      el("div", { class: "result__img" }, [el("img", { src: safeSrc(st.image), alt: "Пример интерьера в стиле «" + st.name + "»", width: "886", height: "1100" })]),
      el("div", {}, [
        el("span", { class: "kicker", text: "Вам подходит стиль" }),
        el("h3", { text: st.name }),
        el("p", { class: "result__desc", text: st.desc }),
        el("h4", { text: "Цветовая палитра" }), pal,
        el("h4", { text: "Планировочные решения" }), list(st.planning),
        el("h4", { text: "Идеи для интерьера" }), list(st.ideas),
        el("div", { class: "result__actions" }, [
          el("a", { class: "btn btn--fill", href: "#contacts", text: "Обсудить проект в этом стиле" }),
          el("button", { class: "btn btn--ghost", type: "button", text: "Смотреть проекты", onclick: function () { setFilter(key); scrollToSection($("#portfolio")); } }),
          el("button", { class: "btn btn--ghost", type: "button", text: "Пройти заново", onclick: function () { answers = []; qi = 0; renderQ(); } })
        ])
      ])
    ]));
    qBody.focus({ preventScroll: true });
    scrollQuiz();
  }
  function resetQuiz() {
    clear(qBody); qBody.appendChild(intro.cloneNode(true));
    qStep.textContent = "Тест · " + D.QUIZ.length + " вопросов · 1 минута"; qBar.style.width = "0";
  }

  /* ---------- Слайдер отзывов ---------- */
  var track = $("#reviews-track");
  $$("[data-slide]").forEach(function (b) {
    b.addEventListener("click", function () {
      var card = track.firstElementChild; if (!card) return;
      var step = card.getBoundingClientRect().width + 24;
      track.scrollBy({ left: step * Number(b.getAttribute("data-slide")), behavior: "smooth" });
    });
  });

  /* ---------- Копирование телефона ---------- */
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-copy");
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(v).then(function () { b.textContent = "Скопировано"; setTimeout(function () { b.textContent = "Скопировать"; }, 2000); });
      }
    });
  });

  /* ---------- Плавающая кнопка ---------- */
  var fabBtn = $(".fab__btn"), fabMenu = $("#fab-menu");
  function setFab(open) { if (!fabBtn) return; fabBtn.setAttribute("aria-expanded", String(open)); fabMenu.hidden = !open; }
  if (fabBtn) {
    fabBtn.addEventListener("click", function () { setFab(fabMenu.hidden); });
    document.addEventListener("click", function (e) { if (!e.target.closest(".fab")) setFab(false); });
    // Прячем кнопку, когда видны тест или контакты — чтобы не перекрывала кнопки
    if ("IntersectionObserver" in window) {
      var seen = new Set(), fab = $(".fab");
      var fio = new IntersectionObserver(function (en) {
        en.forEach(function (x) { if (x.isIntersecting) seen.add(x.target); else seen.delete(x.target); });
        var hide = seen.size > 0;
        fab.classList.toggle("is-hidden", hide);
        if (hide) setFab(false);
        /* Кнопка «Наверх» стоит по центру экрана — там же прячем её,
           чтобы не закрывать варианты теста и контакты. */
        if (toTop) toTop.classList.toggle("is-hidden", hide);
      }, { threshold: 0.15 });
      ["#quiz", "#contacts"].forEach(function (s) { var n = $(s); if (n) fio.observe(n); });
    }
  }
})();
