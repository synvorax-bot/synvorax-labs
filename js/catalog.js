/**
 * Synvorax Labs — Catalog Manager
 * Renders product cards with lazy loading, 3D tilt, and spotlight
 */

const CatalogManager = (() => {
  let catalog = null;
  let filteredProducts = [];
  let displayedCount = 0;
  const PAGE_SIZE = 6;
  let observer = null;
  let loadMoreBound = false;

  function init(data) {
    catalog = data;
    filteredProducts = [...(data.products || [])];

    if (window.SearchManager) {
      SearchManager.init(data, onFilterChange);
    }

    renderProducts(true);
    initLazyLoad();
    initCardEffects();
  }

  function onFilterChange(products) {
    filteredProducts = products;
    displayedCount = 0;
    renderProducts(true);
    updateResultsCount();
    updateLoadMoreVisibility();
  }

  function renderSkeletons() {
    const grid = document.getElementById('catalog-grid');
    grid.innerHTML = Array(6).fill('').map(() => `
      <div class="skeleton-card">
        <div class="skeleton skeleton-card__image"></div>
        <div class="skeleton-card__body">
          <div class="skeleton skeleton-card__line skeleton-card__line--short"></div>
          <div class="skeleton skeleton-card__line skeleton-card__line--title"></div>
          <div class="skeleton skeleton-card__line"></div>
          <div class="skeleton skeleton-card__line"></div>
        </div>
      </div>
    `).join('');
  }

  function getStatusInfo(statusId) {
    return catalog.statuses.find(s => s.id === statusId) || { label: statusId, color: '#6B7280' };
  }

  function getCategoryLabel(categoryId) {
    const cat = catalog.categories.find(c => c.id === categoryId);
    return cat ? cat.label : categoryId;
  }

  function formatPrice(product) {
    if (product.price == null) return '';
    const symbols = { EUR: '€', USD: '$', GBP: '£' };
    const symbol = symbols[product.currency] || '';
    return `${symbol}${product.price}`;
  }

  function createProductCard(product) {
    const status = getStatusInfo(product.status);
    const price = formatPrice(product);
    return `
      <article class="product-card reveal" data-product-id="${product.id}" tabindex="0" role="button" aria-label="View ${product.name}">
        <div class="product-card__spotlight"></div>
        <div class="product-card__image-wrap">
          <img class="product-card__image" src="${product.image}" alt="${product.name}" loading="lazy" width="400" height="250">
        </div>
        <div class="product-card__body">
          <div class="product-card__meta">
            <span class="product-card__category">${getCategoryLabel(product.category)}</span>
            <span class="status-badge" style="color: ${status.color}; border-color: ${status.color}33">${status.label}</span>
          </div>
          <h3 class="product-card__name">${product.name}</h3>
          <p class="product-card__desc">${product.description}</p>
          <div class="product-card__footer">
            ${price ? `<div class="product-card__price">${price}</div>` : '<span></span>'}
            ${product.status === 'out-of-stock'
              ? `<button type="button" class="btn btn--secondary btn--sm" disabled>${catalog.cart?.outOfStockLabel || 'Out of Stock'}</button>`
              : `<button type="button" class="btn btn--primary btn--sm" data-add-to-cart="${product.id}">${catalog.cart?.addToCartLabel || 'Add to Cart'}</button>`
            }
          </div>
        </div>
      </article>
    `;
  }

  function renderProducts(reset = false) {
    const grid = document.getElementById('catalog-grid');
    if (!grid || !catalog) return;

    if (reset) {
      displayedCount = 0;
      grid.innerHTML = '';
    }

    if (filteredProducts.length === 0) {
      grid.innerHTML = `<p class="catalog__empty reveal" style="grid-column: 1/-1; text-align: center; color: var(--text-tertiary); padding: 3rem;">${catalog.catalogSection.emptyState}</p>`;
      return;
    }

    const slice = filteredProducts.slice(displayedCount, displayedCount + PAGE_SIZE);
    const fragment = document.createDocumentFragment();
    const temp = document.createElement('div');

    temp.innerHTML = slice.map(createProductCard).join('');
    while (temp.firstChild) fragment.appendChild(temp.firstChild);

    grid.appendChild(fragment);
    displayedCount += slice.length;

    bindCardClicks(grid.querySelectorAll('.product-card:not([data-bound])'));
    grid.querySelectorAll('.product-card:not([data-bound])').forEach(card => {
      card.setAttribute('data-bound', 'true');
      initTilt(card);
      initSpotlight(card);
    });

    if (window.Animations?.revealElements) {
      try {
        Animations.revealElements(grid.querySelectorAll('.product-card:not(.revealed)'));
      } catch (e) {
        grid.querySelectorAll('.product-card').forEach(el => el.classList.add('revealed'));
      }
    }

    updateResultsCount();
    updateLoadMoreVisibility();
  }

  function bindCardClicks(cards) {
    cards.forEach(card => {
      const open = () => {
        const id = card.dataset.productId;
        const product = catalog.products.find(p => p.id === id);
        if (product && window.ModalManager) ModalManager.open(product);
      };

      card.addEventListener('click', (e) => {
        if (e.target.closest('button, a')) return;
        open();
      });

      card.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest('button, a')) return;
        e.preventDefault();
        open();
      });
    });
  }

  function initTilt(card) {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -6;
      const rotateY = ((x - centerX) / centerX) * 6;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  }

  function initSpotlight(card) {
    const spotlight = card.querySelector('.product-card__spotlight');
    if (!spotlight) return;

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      spotlight.style.setProperty('--mouse-x', `${x}%`);
      spotlight.style.setProperty('--mouse-y', `${y}%`);
    });
  }

  function initCardEffects() {
    if (loadMoreBound) return;
    loadMoreBound = true;
    const btn = document.getElementById('load-more');
    if (!btn) return;
    btn.addEventListener('click', () => renderProducts(false));
  }

  function initLazyLoad() {
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
            }
            observer.unobserve(img);
          }
        });
      }, { rootMargin: '100px' });
    }
  }

  function updateResultsCount() {
    const el = document.getElementById('catalog-results');
    el.textContent = `${filteredProducts.length} ${catalog.catalogSection.resultsLabel}`;
  }

  function updateLoadMoreVisibility() {
    const btn = document.getElementById('load-more');
    btn.style.display = displayedCount < filteredProducts.length ? 'inline-flex' : 'none';
  }

  return { init };
})();

window.CatalogManager = CatalogManager;
