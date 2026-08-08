/**
 * Synvorax Labs — Search & Filter Manager
 */

const SearchManager = (() => {
  let catalog = null;
  let onChangeCallback = null;
  let activeCategory = 'all';
  let activeStatus = 'all';
  let activeSort = 'newest';
  let searchQuery = '';
  let initialized = false;

  function init(data, onChange) {
    catalog = data;
    onChangeCallback = onChange;

    renderCategoryFilters();
    renderStatusFilters();
    renderSortOptions();

    if (!initialized) {
      bindEvents();
      initialized = true;
    }
  }

  function renderCategoryFilters() {
    const container = document.getElementById('category-filters');
    container.innerHTML = catalog.categories.map(cat => `
      <button class="filter-btn ${cat.id === 'all' ? 'active' : ''}" data-filter="category" data-value="${cat.id}">${cat.label}</button>
    `).join('');
  }

  function renderStatusFilters() {
    const container = document.getElementById('status-filters');
    container.innerHTML = catalog.statuses.map(status => `
      <button class="filter-btn ${status.id === 'all' ? 'active' : ''}" data-filter="status" data-value="${status.id}">${status.label}</button>
    `).join('');
  }

  function renderSortOptions() {
    const select = document.getElementById('sort-select');
    select.innerHTML = catalog.sortOptions.map(opt =>
      `<option value="${opt.id}">${opt.label}</option>`
    ).join('');
  }

  function bindEvents() {
    document.getElementById('catalog-search').addEventListener('input', debounce((e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      applyFilters();
    }, 200));

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        const value = btn.dataset.value;

        document.querySelectorAll(`.filter-btn[data-filter="${filter}"]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (filter === 'category') activeCategory = value;
        if (filter === 'status') activeStatus = value;

        applyFilters();
      });
    });

    document.getElementById('sort-select').addEventListener('change', (e) => {
      activeSort = e.target.value;
      applyFilters();
    });
  }

  function applyFilters() {
    let results = [...catalog.products];

    if (activeCategory !== 'all') {
      results = results.filter(p => p.category === activeCategory);
    }

    if (activeStatus !== 'all') {
      results = results.filter(p => p.status === activeStatus);
    }

    if (searchQuery) {
      results = results.filter(p => {
        const searchable = [
          p.name,
          p.description,
          p.longDescription,
          p.category,
          p.status,
          ...p.specifications.map(s => `${s.label} ${s.value}`),
        ].join(' ').toLowerCase();
        return searchable.includes(searchQuery);
      });
    }

    results = sortProducts(results);
    onChangeCallback(results);
  }

  function sortProducts(products) {
    const statusOrder = ['in-stock', 'on-order', 'out-of-stock'];
    const sorted = [...products];

    switch (activeSort) {
      case 'alphabetical':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'price-asc':
        sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
        break;
      case 'price-desc':
        sorted.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
        break;
      case 'status':
        sorted.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
        break;
      case 'newest':
      default:
        sorted.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
        break;
    }

    return sorted;
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  return { init };
})();

window.SearchManager = SearchManager;
