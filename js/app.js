/**
 * Synvorax Labs — Main Application
 * Loads catalog.json and renders all dynamic content
 */

const App = (() => {
  let catalog = null;
  let lenis = null;

  async function init() {
    document.body.classList.add('loading');
    showLoader();

    try {
      catalog = await fetchCatalog();
      injectSEO(catalog);
      applyTheme(catalog.theme?.default || 'dark');
      renderAll(catalog);

      try { if (window.CatalogManager) CatalogManager.init(catalog); } catch (e) { console.warn('CatalogManager:', e); }
      try { if (window.ModalManager) ModalManager.init(catalog); } catch (e) { console.warn('ModalManager:', e); }
      try { if (window.CartManager) CartManager.init(catalog); } catch (e) { console.warn('CartManager:', e); }

      await waitForLibraries();

      initNavbar();
      initThemeToggle();
      initMobileNav();

      try { if (window.Animations) Animations.init(catalog); } catch (e) { console.warn('Animations:', e); }
      try { if (window.BackgroundEngine) BackgroundEngine.init(); } catch (e) { console.warn('BackgroundEngine:', e); }
      try { if (window.DNAHelix) DNAHelix.init('dna-canvas'); } catch (e) { console.warn('DNAHelix:', e); }

      initSmoothScroll();
      await finishLoader();
    } catch (err) {
      console.error('Failed to initialize:', err);
      hideLoader();
    }

    document.body.classList.remove('loading');
  }

  async function fetchCatalog() {
    const res = await fetch('data/catalog.json');
    if (!res.ok) throw new Error('Failed to load catalog');
    return res.json();
  }

  function injectSEO(data) {
    const { seo, company } = data;
    document.title = seo.title;
    document.documentElement.lang = 'en';

    const metaTags = [
      { name: 'description', content: seo.description },
      { name: 'keywords', content: seo.keywords },
      { name: 'author', content: company.name },
      { property: 'og:title', content: seo.title },
      { property: 'og:description', content: seo.description },
      { property: 'og:image', content: seo.ogImage },
      { property: 'og:url', content: seo.url },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: company.name },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: seo.twitterHandle },
      { name: 'twitter:title', content: seo.title },
      { name: 'twitter:description', content: seo.description },
      { name: 'twitter:image', content: seo.ogImage },
    ];

    metaTags.forEach(({ name, property, content }) => {
      const el = document.createElement('meta');
      if (name) el.name = name;
      if (property) el.setAttribute('property', property);
      el.content = content;
      document.head.appendChild(el);
    });

    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = seo.url;
    document.head.appendChild(canonical);
  }

  function renderAll(data) {
    renderLoader(data.loading);
    renderNavbar(data);
    renderHero(data.hero);
    renderCatalogSection(data.catalogSection);
    renderOrdering(data.ordering);
    renderFooter(data);
  }

  function isExternal(href) {
    return /^https?:|^mailto:|^tel:/.test(href);
  }

  function renderLoader(loading) {
    document.querySelector('.loader__text').textContent = loading.text;
    document.querySelector('.loader__subtext').textContent = loading.subtext;
  }

  function renderNavbar(data) {
    document.querySelector('.navbar__name').textContent = data.company.name;

    const navLinks = document.getElementById('nav-links');
    navLinks.innerHTML = data.navigation.map(item =>
      `<li><a href="${item.href}" data-section="${item.id}">${item.label}</a></li>`
    ).join('');

    const cta = document.getElementById('nav-cta');
    cta.textContent = data.cta.navbar.label;
    cta.href = data.cta.navbar.href || '#cart';
    if (isExternal(data.cta.navbar.href)) {
      cta.target = '_blank';
      cta.rel = 'noopener noreferrer';
    } else {
      cta.removeAttribute('target');
      cta.removeAttribute('rel');
    }
  }

  function renderHero(hero) {
    document.querySelector('.hero__eyebrow').textContent = hero.eyebrow;
    document.querySelector('.hero__title-line').textContent = hero.headline;
    document.querySelector('.hero__title-accent').textContent = hero.headlineAccent;
    document.querySelector('.hero__description').textContent = hero.description;

    const buttonsEl = document.getElementById('hero-buttons');
    buttonsEl.innerHTML = hero.buttons.map(btn =>
      `<a href="${btn.href}" class="btn btn--${btn.variant} btn-ripple"${isExternal(btn.href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${btn.label}</a>`
    ).join('');
  }

  function icon(name, size = 24) {
    return `<img src="assets/icons/${name}.svg" alt="" width="${size}" height="${size}" class="icon-img" loading="lazy">`;
  }

  function renderCatalogSection(section) {
    document.querySelector('.catalog__eyebrow').textContent = section.eyebrow;
    document.querySelector('.catalog__title').textContent = section.title;
    document.querySelector('.catalog__description').textContent = section.description;
    document.getElementById('catalog-search').placeholder = section.searchPlaceholder;
    document.getElementById('load-more').textContent = section.loadMoreLabel;
  }

  function renderOrdering(ordering) {
    if (!ordering) return;
    document.querySelector('.order-cta__title').textContent = ordering.title;
    document.querySelector('.order-cta__text').textContent = ordering.text;
    const btn = document.getElementById('order-cta-btn');
    btn.textContent = ordering.button || 'Open Cart';
  }

  function renderFooter(data) {
    const { footer, company } = data;
    document.querySelector('.footer__name').textContent = company.name;
    document.querySelector('.footer__tagline').textContent = company.tagline;
    document.querySelector('.footer__copyright').textContent = footer.copyright;

    document.querySelector('.footer__order-title').textContent = footer.order.title;
    document.querySelector('.footer__order-text').textContent = footer.order.text;
    const orderBtn = document.getElementById('footer-order-btn');
    orderBtn.textContent = footer.order.button;

    document.getElementById('footer-links').innerHTML = footer.links
      .map(l => `<a href="${l.href}"${isExternal(l.href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${l.label}</a>`).join('');

    document.getElementById('footer-social').innerHTML = (footer.social || [])
      .map(s => `<a href="${s.href}" target="_blank" rel="noopener noreferrer" aria-label="${s.platform}">${icon(s.icon, 18)}</a>`).join('');
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('synvorax-theme', theme);
  }

  function initThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });

    const saved = localStorage.getItem('synvorax-theme');
    if (saved) applyTheme(saved);
  }

  function initNavbar() {
    const navbar = document.getElementById('navbar');
    const links = document.querySelectorAll('.navbar__links a');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      navbar.classList.toggle('scrolled', scrollY > 50);

      if (scrollY > lastScroll && scrollY > 200) {
        navbar.classList.add('hidden-nav');
      } else {
        navbar.classList.remove('hidden-nav');
      }
      lastScroll = scrollY;

      const sections = document.querySelectorAll('section[id]');
      sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= 100 && rect.bottom >= 100) {
          links.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${section.id}`);
          });
        }
      });
    }, { passive: true });
  }

  function initMobileNav() {
    const toggle = document.getElementById('nav-toggle');
    const links = document.getElementById('nav-links');
    if (!toggle || !links) return;

    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      toggle.classList.toggle('active', isOpen);
      toggle.setAttribute('aria-expanded', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    links.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        links.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  function initSmoothScroll() {
    if (typeof Lenis === 'undefined') return;

    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    if (typeof ScrollTrigger !== 'undefined') {
      lenis.on('scroll', ScrollTrigger.update);
    }

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const href = anchor.getAttribute('href');
        if (href === '#' || href === '#cart') return;
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) lenis.scrollTo(target, { offset: -72 });
      });
    });
  }

  function initButtonRipples() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-ripple');
      if (!btn) return;
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  }

  function showLoader() {
    const progress = document.querySelector('.loader__progress');
    let width = 0;
    const interval = setInterval(() => {
      width += Math.random() * 15;
      if (width >= 90) {
        width = 90;
        clearInterval(interval);
      }
      progress.style.width = `${width}%`;
    }, 200);
  }

  async function finishLoader() {
    const progress = document.querySelector('.loader__progress');
    progress.style.width = '100%';
    await new Promise(r => setTimeout(r, 400));
    hideLoader();
  }

  function hideLoader() {
    document.getElementById('loader').classList.add('hidden');
  }

  function waitForLibraries() {
    return new Promise(resolve => {
      const check = () => {
        if (typeof gsap !== 'undefined' && typeof THREE !== 'undefined') {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  function getCatalog() {
    return catalog;
  }

  document.addEventListener('DOMContentLoaded', () => {
    initButtonRipples();
    init();
  });

  return { getCatalog };
})();
