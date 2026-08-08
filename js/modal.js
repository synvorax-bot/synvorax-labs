/**
 * Synvorax Labs — Product Modal
 */

const ModalManager = (() => {
  let catalog = null;
  let modal = null;
  let container = null;
  let currentProduct = null;

  function init(data) {
    catalog = data;
    modal = document.getElementById('modal');
    container = modal.querySelector('.modal__container');

    modal.querySelector('.modal__close').addEventListener('click', close);
    modal.querySelector('.modal__backdrop').addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) close();
    });
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

  function open(product) {
    currentProduct = product;
    const status = getStatusInfo(product.status);
    const price = formatPrice(product);
    const content = document.getElementById('modal-content');

    content.innerHTML = `
      <div class="modal__hero">
        <img id="modal-main-image" src="${product.image}" alt="${product.name}">
      </div>
      <div class="modal__body">
        <div class="modal__header">
          <div>
            <span class="product-card__category">${getCategoryLabel(product.category)}</span>
            <h2 class="modal__title">${product.name}</h2>
          </div>
          <div class="modal__header-right">
            ${price ? `<span class="modal__price">${price}</span>` : ''}
            <span class="status-badge" style="color: ${status.color}; border-color: ${status.color}33">${status.label}</span>
          </div>
        </div>
        <p class="modal__desc">${product.longDescription || product.description}</p>
        ${product.gallery && product.gallery.length > 1 ? `
          <div class="modal__gallery" id="modal-gallery">
            ${product.gallery.map((img, i) => `
              <img src="${img}" alt="${product.name} view ${i + 1}" class="${i === 0 ? 'active' : ''}" data-full="${img}">
            `).join('')}
          </div>
        ` : ''}
        <div class="modal__specs">
          ${product.specifications.map(spec => `
            <div class="modal__spec">
              <div class="modal__spec-label">${spec.label}</div>
              <div class="modal__spec-value">${spec.value}</div>
            </div>
          `).join('')}
        </div>
        ${catalog.telegram ? `
          <a class="btn btn--primary btn--lg modal__order" href="${catalog.telegram.url}" target="_blank" rel="noopener noreferrer">
            ${catalog.telegram.label}
          </a>
        ` : ''}
      </div>
    `;

    bindGalleryEvents();
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (window.Animations) {
      Animations.openModal(container);
    }
  }

  function bindGalleryEvents() {
    const gallery = document.getElementById('modal-gallery');
    if (!gallery) return;

    const mainImage = document.getElementById('modal-main-image');
    gallery.querySelectorAll('img').forEach(thumb => {
      thumb.addEventListener('click', () => {
        gallery.querySelectorAll('img').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        mainImage.style.opacity = '0';
        setTimeout(() => {
          mainImage.src = thumb.dataset.full;
          mainImage.style.opacity = '1';
        }, 200);
      });
    });
  }

  function close() {
    const doClose = () => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      currentProduct = null;
    };

    if (window.Animations) {
      Animations.closeModal(container, doClose);
    } else {
      doClose();
    }
  }

  return { init, open, close };
})();

window.ModalManager = ModalManager;
