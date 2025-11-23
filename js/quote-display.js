// ===================================
// QUOTE-DISPLAY.JS - Quote Rendering with Virtual Scrolling
// ===================================

export class QuoteDisplay {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.quotes = [];
    this.visibleQuotes = [];
    this.itemHeight = 200; // Approximate height of each quote card
    this.scrollTop = 0;
    this.onTagClick = null;
  }

  // Render quotes (simplified - no virtual scrolling for now)
  render(quotes) {
    this.quotes = quotes;

    if (quotes.length === 0) {
      this.showEmptyState();
      return;
    }

    // Render all quotes (we'll add virtual scrolling back once basic rendering works)
    const html = quotes.map(quote => this.renderQuoteCard(quote)).join('');
    this.container.innerHTML = html;

    // Attach event listeners
    this.attachEventListeners();
  }

  // Render a single quote card
  renderQuoteCard(quote) {
    // Handle both lowercase (Static API) and Capitalized (Legacy) keys
    const categoryVal = quote.category || quote.Category || 'default';
    const authorVal = quote.author || quote.Author || 'Unknown';
    const quoteTextVal = quote.quote || quote.Quote || '';
    const tagsVal = quote.tags || quote.Tags || [];
    const popularityVal = quote.popularity || quote.Popularity || 0;

    const category = categoryVal.toLowerCase().replace(/\s+/g, '-');
    const bookMatch = authorVal.match(/,\s*(.+)$/);
    const authorName = bookMatch ? authorVal.split(',')[0].trim() : authorVal;
    const bookTitle = bookMatch ? bookMatch[1].trim() : '';

    const isTruncated = quoteTextVal.length > 200;
    const displayText = isTruncated ? quoteTextVal.substring(0, 200) + '...' : quoteTextVal;

    const tags = tagsVal
      .filter(tag => tag && tag.trim())
      .slice(0, 8) // Limit to 8 tags
      .map(tag => `<span class="tag" data-tag="${this.escapeHtml(tag.trim())}">${this.escapeHtml(tag.trim())}</span>`)
      .join('');

    const popularity = Math.round(popularityVal * 100);

    return `
      <div class="quote-card category-${category}" data-quote-id="${quote.id}">
        <div class="quote-text ${isTruncated ? 'truncated' : ''}" data-full-text="${this.escapeHtml(quoteTextVal)}">
          "${this.escapeHtml(displayText)}"
        </div>
        ${isTruncated ? '<span class="read-more">Read more</span>' : ''}
        
        <div class="quote-author">
          <strong>${this.escapeHtml(authorName)}</strong>
          ${bookTitle ? `<span class="quote-book">📚 ${this.escapeHtml(bookTitle)}</span>` : ''}
        </div>
        
        ${tags ? `<div class="quote-tags">${tags}</div>` : ''}
        
        <div class="quote-meta">
          <div class="quote-popularity">
            <span>⭐ Popularity</span>
            <div class="popularity-bar">
              <div class="popularity-fill" style="width: ${popularity}%"></div>
            </div>
          </div>
          ${categoryVal ? `<span class="quote-category ${category}">${this.escapeHtml(categoryVal)}</span>` : ''}
        </div>
      </div>
    `;
  }

  // Show empty state
  showEmptyState() {
    this.container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-text">
          No quotes found matching your filters.<br>
          Try adjusting your search or clearing some filters.
        </div>
      </div>
    `;
  }

  // Attach event listeners
  attachEventListeners() {
    // Tag click handlers
    const tags = this.container.querySelectorAll('.tag');
    tags.forEach(tag => {
      tag.addEventListener('click', (e) => {
        const tagText = e.target.dataset.tag;
        if (this.onTagClick) {
          this.onTagClick(tagText);
        }
      });
    });

    // Read more handlers
    const readMoreBtns = this.container.querySelectorAll('.read-more');
    readMoreBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.quote-card');
        const textEl = card.querySelector('.quote-text');
        const fullText = textEl.dataset.fullText;

        textEl.textContent = `"${fullText}"`;
        textEl.classList.remove('truncated');
        e.target.remove();
      });
    });
  }

  // Handle scroll (disabled for now)
  onScroll(scrollTop) {
    // Virtual scrolling disabled - will re-enable after basic functionality works
  }

  // Escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Clear display
  clear() {
    this.container.innerHTML = '';
    this.quotes = [];
  }
}
