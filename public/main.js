(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function rafThrottle(fn) {
    var queued = false;
    return function () {
      var args = arguments;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        fn.apply(null, args);
        queued = false;
      });
    };
  }

  // Theme toggle with a small material transition.
  window.toggleTheme = function () {
    var current = root.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    var button = document.querySelector('.theme-toggle');
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    if (button) {
      button.classList.remove('is-spinning');
      void button.offsetWidth;
      button.classList.add('is-spinning');
      button.setAttribute('aria-label', next === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    }
  };

  // Reading progress + compact floating navigation.
  var progressBar = document.querySelector('.reading-progress .bar');
  var header = document.querySelector('.site-header');
  function updateScrollUI() {
    var doc = document.documentElement;
    var top = doc.scrollTop || document.body.scrollTop;
    var height = doc.scrollHeight - doc.clientHeight;
    if (progressBar) progressBar.style.width = (height > 0 ? top / height * 100 : 0) + '%';
    if (header) header.classList.toggle('is-compact', top > 24);
  }
  document.addEventListener('scroll', rafThrottle(updateScrollUI), { passive: true });
  updateScrollUI();

  // Mark current nav entry.
  var currentPath = location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll('.site-nav a').forEach(function (link) {
    var url;
    try { url = new URL(link.href, location.origin); } catch (e) { return; }
    if (url.origin !== location.origin) return;
    var linkPath = url.pathname.replace(/\/+$/, '') || '/';
    if (linkPath === currentPath || (linkPath !== '/' && currentPath.indexOf(linkPath + '/') === 0)) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });

  // Responsive navigation with a liquid-glass backdrop on small screens.
  var menuButton = document.querySelector('.mobile-menu-toggle');
  var nav = document.querySelector('.site-nav');
  var navBackdrop = null;

  function setMenuState(open) {
    if (!menuButton || !nav) return;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('is-nav-open', open);
    if (navBackdrop) navBackdrop.setAttribute('aria-hidden', String(!open));
  }

  function closeMenu(restoreFocus) {
    var wasOpen = menuButton && menuButton.getAttribute('aria-expanded') === 'true';
    setMenuState(false);
    if (wasOpen && restoreFocus && menuButton) menuButton.focus();
  }

  if (menuButton && nav) {
    navBackdrop = document.createElement('button');
    navBackdrop.type = 'button';
    navBackdrop.className = 'mobile-nav-backdrop';
    navBackdrop.setAttribute('aria-label', '关闭导航');
    navBackdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(navBackdrop);

    menuButton.addEventListener('click', function () {
      var open = menuButton.getAttribute('aria-expanded') === 'true';
      setMenuState(!open);
    });
    navBackdrop.addEventListener('click', function () {
      closeMenu(true);
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) closeMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMenu(true);
    });
    document.addEventListener('click', function (event) {
      if (!nav.contains(event.target) && !menuButton.contains(event.target) && event.target !== navBackdrop) {
        closeMenu(false);
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 820) closeMenu(false);
    });
  }
  // Pointer-linked light refraction and subtle parallax.
  if (finePointer && !reduceMotion) {
    document.addEventListener('pointermove', rafThrottle(function (event) {
      root.style.setProperty('--pointer-x', (event.clientX / window.innerWidth * 100).toFixed(2) + '%');
      root.style.setProperty('--pointer-y', (event.clientY / window.innerHeight * 100).toFixed(2) + '%');
    }), { passive: true });

    var hero = document.querySelector('[data-liquid-hero]');
    var stage = document.querySelector('[data-tilt]');
    if (hero && stage) {
      hero.addEventListener('pointermove', rafThrottle(function (event) {
        var rect = hero.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width;
        var y = (event.clientY - rect.top) / rect.height;
        hero.style.setProperty('--shine-x', (x * 100).toFixed(1) + '%');
        hero.style.setProperty('--shine-y', (y * 100).toFixed(1) + '%');
        stage.style.transform = 'rotateX(' + ((.5 - y) * 8).toFixed(2) + 'deg) rotateY(' + ((x - .5) * 10).toFixed(2) + 'deg)';
      }));
      hero.addEventListener('pointerleave', function () {
        stage.style.transform = '';
      });
    }

    document.querySelectorAll('.post-card').forEach(function (card) {
      card.addEventListener('pointermove', rafThrottle(function (event) {
        var rect = card.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width;
        var y = (event.clientY - rect.top) / rect.height;
        card.style.setProperty('--card-x', (x * 100).toFixed(1) + '%');
        card.style.setProperty('--card-y', (y * 100).toFixed(1) + '%');
        if (card.classList.contains('is-visible')) {
          card.style.transform = 'perspective(850px) rotateX(' + ((.5 - y) * 3.5).toFixed(2) + 'deg) rotateY(' + ((x - .5) * 4.5).toFixed(2) + 'deg) translateY(-4px)';
        }
      }));
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }

  // Scroll reveal, progressively enhanced.
  var revealItems = document.querySelectorAll('.site-notice, .section-header, .post-card, .page-header, .category-card, .archive-item');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    revealItems.forEach(function (item, index) {
      item.classList.add('reveal-ready');
      item.style.transitionDelay = Math.min(index % 6 * 55, 220) + 'ms';
    });
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -35px' });
    revealItems.forEach(function (item) { revealObserver.observe(item); });
  } else {
    revealItems.forEach(function (item) { item.classList.add('is-visible'); });
  }

  // Graceful fallback for expired or unreachable article covers.
  document.querySelectorAll('.post-cover img').forEach(function (image) {
    var cover = image.closest('.post-cover');
    function markBroken() { if (cover) cover.classList.add('is-broken'); }
    image.addEventListener('error', markBroken);
    if (image.complete && image.naturalWidth === 0) markBroken();
  });

  // Code copy.
  window.copyCode = function (button) {
    var code = button.closest('.notion-code').querySelector('pre code');
    if (!code) return;
    var text = code.innerText;
    var done = function () {
      var old = button.innerText;
      button.innerText = '已复制 ✓';
      setTimeout(function () { button.innerText = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { button.innerText = '复制失败'; });
    } else {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand('copy'); done(); } catch (e) { button.innerText = '复制失败'; }
      textarea.remove();
    }
  };

  // TOC active link.
  var tocLinks = document.querySelectorAll('.post-toc-list a');
  if (tocLinks.length) {
    var headings = Array.from(tocLinks).map(function (link) {
      try { return document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1))); }
      catch (e) { return null; }
    });
    function updateToc() {
      var scroll = window.scrollY + 150;
      var active = -1;
      headings.forEach(function (heading, index) { if (heading && heading.offsetTop <= scroll) active = index; });
      tocLinks.forEach(function (link, index) { link.classList.toggle('active', index === active); });
    }
    document.addEventListener('scroll', rafThrottle(updateToc), { passive: true });
    updateToc();
  }

  // Search.
  var input = document.getElementById('search-input');
  if (input) {
    var resultsEl = document.getElementById('search-results');
    var data = [];
    fetch('/search.json').then(function (response) { return response.json(); }).then(function (items) { data = items; });
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, function (char) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]; });
    }
    function highlight(text, query) {
      var safe = escapeHtml(text);
      if (!query) return safe;
      var safeQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return safe.replace(new RegExp(safeQuery, 'gi'), function (match) { return '<mark>' + match + '</mark>'; });
    }
    function render(items, query) {
      if (!items.length) {
        resultsEl.innerHTML = '<div class="empty">没有找到与「<strong>' + escapeHtml(query) + '</strong>」相关的文章</div>';
        return;
      }
      resultsEl.innerHTML = items.map(function (post) {
        return '<article class="post-card is-visible"><div class="post-card-body">' +
          '<div class="post-card-meta"><time>' + post.date + '</time></div>' +
          '<h3 class="post-card-title"><a href="' + post.url + '">' + highlight(post.title, query) + '</a></h3>' +
          '<p class="post-card-summary">' + highlight(post.summary || '', query) + '</p>' +
          '<div class="post-card-tags">' + (post.tags || []).map(function (tag) { return '<span class="tag">' + escapeHtml(tag) + '</span>'; }).join('') + '</div>' +
          '</div></article>';
      }).join('');
    }
    input.addEventListener('input', function () {
      var query = input.value.trim().toLowerCase();
      if (!query) { resultsEl.innerHTML = ''; return; }
      var items = data.filter(function (post) {
        return (post.title + ' ' + (post.summary || '') + ' ' + (post.tags || []).join(' ')).toLowerCase().indexOf(query) !== -1;
      });
      render(items, query);
    });
  }
})();





