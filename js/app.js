// ===================================
// APP.JS - Main Application Controller
// ===================================

import { DataLoader } from './data-loader.js?v=21';
import { SearchEngine } from './search-engine.js?v=21';
import { WordcloudRenderer } from './wordcloud.js?v=21';
import { QuoteDisplay } from './quote-display.js?v=21';

class QuoteCloudApp {
    constructor() {
        // Core components
        this.dataLoader = new DataLoader();
        this.searchEngine = null;
        this.wordcloud = new WordcloudRenderer('wordcloud');
        this.quoteDisplay = new QuoteDisplay('quote-list');

        // State
        this.allQuotes = [];
        this.indexes = {};
        this.tagFrequencies = [];
        this.authorStats = [];
        this.currentMode = 'tags'; // 'tags' or 'authors'
        this.filters = {
            searchTerm: '',
            tags: [],
            categories: [],
            authors: [],
            popularityMin: 0,
            sortBy: 'popularity'
        };
        this.filteredQuotes = [];

        // UI Elements
        this.loadingScreen = document.getElementById('loading-screen');
        this.loadingStatus = document.getElementById('loading-status');
        this.loadingProgress = document.getElementById('loading-progress');
        this.appContainer = document.getElementById('app');
        this.quoteCount = document.getElementById('quote-count');
        this.activeFiltersContainer = document.getElementById('active-filters');

        // Debounce timer
        this.searchDebounceTimer = null;
    }

    // Initialize app
    async init() {
        try {
            // Static Mode: We DO NOT load all quotes initially.
            // We only load keywords and stats.
            // Quotes are fetched on demand (per keyword) or via Deep Search (full index).

            this.allQuotes = []; // Explicitly empty

            // Load initial data (keywords & stats)
            this.loadingStatus.textContent = 'Loading wordcloud data...';
            const data = await this.dataLoader.loadInitialData();

            if (!data || !data.keywords) {
                throw new Error('Invalid data loaded: keywords missing');
            }

            this.keywords = data.keywords;
            this.stats = data.stats;

            // We don't build indexes or initialize search engine here anymore.
            // They are initialized lazily in performDeepSearch.

            // Setup UI
            this.setupUI();
            this.setupEventListeners();

            // Initial render
            this.renderWordcloud();
            this.updateStats();

            // Auto-load top keyword to replace placeholder
            const allKeywords = Object.values(this.keywords).flat();
            if (allKeywords.length > 0) {
                // Find global top keyword by impact
                const topKeyword = allKeywords.reduce((prev, current) =>
                    (prev.impact > current.impact) ? prev : current
                );

                console.log('App: Auto-loading top keyword:', topKeyword.word);
                this.handleWordClick({ text: topKeyword.word });
            }

            // Hide loading screen
            setTimeout(() => {
                this.loadingScreen.classList.add('hidden');
                this.appContainer.style.display = 'flex';
            }, 500);

        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.loadingStatus.innerHTML = `
        <div style="color: #ff6b6b; text-align: left; background: rgba(0,0,0,0.5); padding: 20px; border-radius: 8px;">
          <h3>Error loading data</h3>
          <p>${error.message}</p>
          <pre style="font-size: 12px; overflow: auto;">${error.stack}</pre>
          <p>Please check console (F12) for more details.</p>
        </div>
      `;
        }
    }

    // Setup UI
    setupUI() {
        if (!this.keywords) {
            console.error('Cannot setup UI: keywords not loaded');
            return;
        }

        // Populate category filters
        const categories = Object.keys(this.keywords).sort();
        const categoryContainer = document.getElementById('category-filters');
        categoryContainer.innerHTML = categories.map(cat => `
      <label class="filter-checkbox">
        <input type="checkbox" value="${cat}" data-filter="category">
        <label>
          <span>${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
          <span class="filter-count">${this.keywords[cat].length}</span>
        </label>
      </label>
    `).join('');

        // Populate author filters (from stats)
        // stats.top_authors is an object { "Author Name": count }
        const authors = Object.entries(this.stats.top_authors || {})
            .sort((a, b) => b[1] - a[1]) // Sort by count desc
            .slice(0, 50); // Top 50 authors

        const authorContainer = document.getElementById('author-filters');
        authorContainer.innerHTML = authors.map(([author, count]) => {
            const cleanAuthor = author.split(',')[0].trim();
            return `
        <label class="filter-checkbox">
          <input type="checkbox" value="${this.escapeHtml(author)}" data-filter="author">
          <label>
            <span>${this.escapeHtml(cleanAuthor)}</span>
            <span class="filter-count">${count}</span>
          </label>
        </label>
      `;
        }).join('');
    }

    // Setup event listeners
    setupEventListeners() {
        // Mode toggle
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.switchMode(mode);
            });
        });

        // Search input (Deep Search)
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                const term = e.target.value.trim();
                if (term.length > 2) {
                    this.performDeepSearch(term);
                } else if (term.length === 0) {
                    this.clearFilters();
                }
            }, 500); // Longer debounce for deep search
        });

        // Category filters
        document.getElementById('category-filters').addEventListener('change', (e) => {
            if (e.target.dataset.filter === 'category') {
                this.updateFilterArray('categories', e.target.value, e.target.checked);
                e.target.closest('.filter-checkbox').classList.toggle('checked', e.target.checked);
            }
        });

        // Author filters
        document.getElementById('author-filters').addEventListener('change', (e) => {
            if (e.target.dataset.filter === 'author') {
                this.updateFilterArray('authors', e.target.value, e.target.checked);
                e.target.closest('.filter-checkbox').classList.toggle('checked', e.target.checked);
            }
        });

        // Author search
        const authorSearch = document.getElementById('author-search');
        authorSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const checkboxes = document.querySelectorAll('#author-filters .filter-checkbox');
            checkboxes.forEach(checkbox => {
                const label = checkbox.querySelector('label span').textContent.toLowerCase();
                checkbox.style.display = label.includes(searchTerm) ? 'flex' : 'none';
            });
        });

        // Popularity slider
        const popularitySlider = document.getElementById('popularity-min');
        popularitySlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.filters.popularityMin = value / 100;
            document.getElementById('popularity-min-label').textContent = `${value}%`;
            this.applyFilters();
        });

        // Sort select
        const sortSelect = document.getElementById('sort-select');
        sortSelect.addEventListener('change', (e) => {
            this.filters.sortBy = e.target.value;
            this.applyFilters();
        });

        // Clear filters
        document.getElementById('clear-filters').addEventListener('click', () => {
            this.clearFilters();
        });

        // Wordcloud interactions
        this.wordcloud.onWordClick = (data, event) => {
            this.handleWordClick(data);
        };

        this.wordcloud.onWordHover = (data, event, isEnter) => {
            this.handleWordHover(data, event, isEnter);
        };

        // Quote display tag clicks
        this.quoteDisplay.onTagClick = (tag) => {
            this.addTagFilter(tag);
        };

        // Quote list scroll
        const quoteList = document.getElementById('quote-list');
        quoteList.addEventListener('scroll', (e) => {
            this.quoteDisplay.onScroll(e.target.scrollTop);
        });

        // Close quote panel
        document.getElementById('close-quotes').addEventListener('click', () => {
            this.clearFilters();
        });
    }

    // Switch mode (tags/authors)
    switchMode(mode) {
        this.currentMode = mode;

        // Update UI
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        this.renderWordcloud();
    }

    // Render wordcloud based on current mode
    renderWordcloud() {
        try {
            if (!this.keywords) return;

            console.log('App: Rendering wordcloud. Filters:', this.filters);

            // Hide placeholder
            const placeholder = document.getElementById('wordcloud-placeholder');
            if (placeholder) placeholder.classList.add('hidden');

            // Flatten keywords for tag cloud
            let tagData = [];

            // If category selected, show only that category's keywords
            if (this.filters.categories.length > 0) {
                console.log('App: Filtering by categories (Intersection):', this.filters.categories);

                // Get keywords for the first category
                const firstCat = this.filters.categories[0];
                let commonKeywords = this.keywords[firstCat] || [];

                // Intersect with subsequent categories
                for (let i = 1; i < this.filters.categories.length; i++) {
                    const nextCat = this.filters.categories[i];
                    const nextKeywords = this.keywords[nextCat] || [];
                    const nextWordsSet = new Set(nextKeywords.map(k => k.word));

                    commonKeywords = commonKeywords.filter(k => nextWordsSet.has(k.word));
                }

                tagData = commonKeywords;
            } else {
                // Show top keywords from all categories
                Object.values(this.keywords).forEach(kws => {
                    tagData = [...tagData, ...kws];
                });
                // Deduplicate and take top 100 by impact
                const seen = new Set();
                tagData = tagData
                    .filter(k => {
                        if (seen.has(k.word)) return false;
                        seen.add(k.word);
                        return true;
                    })
                    .sort((a, b) => b.impact - a.impact)
                    .slice(0, 60);
            }

            // Map to D3 format
            const words = tagData.map(k => ({
                text: k.word,
                size: 20 + (k.impact * 60), // Scale size by impact
                category: this.getCategoryForWord(k.word)
            }));

            this.wordcloud.renderTagCloud(words);
        } catch (error) {
            console.error('App: Error rendering wordcloud:', error);
        }
    }

    // Helper to find category for a word
    getCategoryForWord(word) {
        for (const [cat, kws] of Object.entries(this.keywords)) {
            if (kws.find(k => k.word === word)) return cat;
        }
        return 'default';
    }

    // Handle word click (Semantic Navigation)
    async handleWordClick(data) {
        console.log('App: Word clicked:', data.text);
        this.loadingStatus.textContent = `Loading quotes for "${data.text}"...`;

        try {
            // Show loading state
            this.quoteDisplay.container.innerHTML = '<div class="loading-spinner"></div>';

            // Update active filters UI manually
            // Single-select mode: Replace existing tags with the new one
            this.filters.tags = [data.text];
            this.updateActiveFilters();

            // Fetch quotes for this keyword
            console.log('App: Fetching quotes for', data.text);
            const quotes = await this.dataLoader.getQuotesForKeyword(data.text);
            console.log('App: Fetched quotes:', quotes.length);

            // Render
            this.filteredQuotes = quotes;
            this.quoteDisplay.render(quotes);
            this.updateStats();

            // Hide placeholder
            document.getElementById('quote-placeholder').classList.add('hidden');
        } catch (error) {
            console.error('App: Error handling word click:', error);
            this.quoteDisplay.container.innerHTML = `<div class="error-message">Error loading quotes: ${error.message}</div>`;
        }
    }

    // Add tag filter (Modified to not auto-apply if just adding visual tag)
    addTagFilter(tag) {
        const cleanTag = tag.trim().toLowerCase();
        if (!this.filters.tags.includes(cleanTag)) {
            this.filters.tags.push(cleanTag);
            this.updateActiveFilters();
            // In Static Mode, we don't call applyFilters() here because we don't have the full index
            // The quote loading is handled by handleWordClick
        }
    }

    // Add author filter
    async addAuthorFilter(author) {
        console.log('Adding author filter:', author);
        if (!this.filters.authors.includes(author)) {
            this.filters.authors.push(author);
            this.updateActiveFilters();

            // In Static Mode, author filtering requires Deep Search (Full Index)
            await this.performDeepSearch(author);
        }
    }

    // Deep Search Implementation
    async performDeepSearch(term) {
        if (!term) return;

        // Load full index if not loaded
        if (!this.dataLoader.fullIndex) {
            this.loadingStatus.textContent = 'Loading search index...';
            document.body.style.cursor = 'wait';
            await this.dataLoader.loadFullIndex();
            document.body.style.cursor = 'default';

            // Initialize Fuse with full index
            this.searchEngine = new SearchEngine(this.dataLoader.fullIndex);
        }

        // Perform search
        const results = this.searchEngine.search(term);

        // Render results
        this.filteredQuotes = results;
        this.quoteDisplay.render(results);
        this.updateStats();
    }

    // Handle word hover
    handleWordHover(data, event, isEnter) {
        if (!isEnter) {
            // Remove tooltip
            const existing = document.querySelector('.wordcloud-tooltip');
            if (existing) existing.remove();
            return;
        }

        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'wordcloud-tooltip';

        if (this.currentMode === 'tags') {
            tooltip.textContent = `${data.text} (${data.size} quotes)`;
        } else {
            tooltip.textContent = `${data.name.split(',')[0]} (${data.quoteCount} quotes)`;
        }

        document.body.appendChild(tooltip);

        // Position tooltip
        const rect = event.target.getBoundingClientRect();
        tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2} px`;
        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 10} px`;
    }

    // Add tag filter
    addTagFilter(tag) {
        const cleanTag = tag.trim().toLowerCase();
        console.log('Adding tag filter:', cleanTag);
        if (!this.filters.tags.includes(cleanTag)) {
            this.filters.tags.push(cleanTag);
            console.log('Current tags:', this.filters.tags);
            this.applyFilters();
        } else {
            console.log('Tag already in filters');
        }
    }

    // Add author filter
    addAuthorFilter(author) {
        console.log('Adding author filter:', author);
        if (!this.filters.authors.includes(author)) {
            this.filters.authors.push(author);
            console.log('Current authors:', this.filters.authors);
            this.applyFilters();
        } else {
            console.log('Author already in filters');
        }
    }

    // Update filter array
    updateFilterArray(filterType, value, isChecked) {
        if (isChecked) {
            if (!this.filters[filterType].includes(value)) {
                this.filters[filterType].push(value);
            }
        } else {
            this.filters[filterType] = this.filters[filterType].filter(v => v !== value);
        }
        this.applyFilters();
    }

    // Apply filters
    async applyFilters() {
        try {
            // If we have a search term, use Deep Search logic
            if (this.filters.searchTerm) {
                await this.performDeepSearch(this.filters.searchTerm);
                return;
            }

            // If we have Author filters, we MUST load the full index (Static Mode doesn't have author data)
            if (this.filters.authors.length > 0) {
                if (!this.dataLoader.fullIndex) {
                    this.loadingStatus.textContent = 'Loading search index for authors...';
                    document.body.style.cursor = 'wait';
                    await this.dataLoader.loadFullIndex();
                    document.body.style.cursor = 'default';

                    // Initialize Fuse with full index
                    this.searchEngine = new SearchEngine(this.dataLoader.fullIndex);
                }

                // Use search engine to filter by author
                this.filteredQuotes = this.searchEngine.filter(this.filters);
                this.quoteDisplay.render(this.filteredQuotes);
                this.updateStats();
                this.updateActiveFilters();

                // Also render wordcloud (filtered by author quotes?)
                // For now, keep default wordcloud or maybe filter it?
                // Let's keep default wordcloud to avoid complexity
                return;
            }

            // If we are in Static Mode (allQuotes empty) and just filtering categories
            // We only need to update the wordcloud, not the quote list (unless we have quotes loaded)
            if (this.allQuotes.length === 0) {
                this.renderWordcloud();
                this.updateActiveFilters();

                // UX Improvement: If category selected but no quotes shown, load top keyword from that category
                if (this.filters.categories.length > 0 && this.filters.tags.length === 0) {
                    const lastCategory = this.filters.categories[this.filters.categories.length - 1];
                    const topKeyword = this.keywords[lastCategory]?.[0]?.word;
                    if (topKeyword) {
                        console.log('App: Auto-selecting top keyword for category:', topKeyword);
                        this.handleWordClick({ text: topKeyword.word });
                    }
                }
                return;
            }

            // Legacy logic (only if we have full index loaded)
            this.filteredQuotes = this.searchEngine.search(this.filters);
            this.quoteDisplay.render(this.filteredQuotes);
            this.renderWordcloud();
            this.updateStats();
            this.updateActiveFilters();

            // Show/hide quote placeholder
            const placeholder = document.getElementById('quote-placeholder');
            placeholder.classList.toggle('hidden', this.filteredQuotes.length > 0);

        } catch (error) {
            console.error('App: Error applying filters:', error);
        }
    }

    // Clear filters
    clearFilters() {
        this.filters = {
            searchTerm: '',
            tags: [],
            categories: [],
            authors: [],
            popularityMin: 0,
            sortBy: 'popularity'
        };

        // Reset UI
        document.getElementById('search-input').value = '';
        document.getElementById('popularity-min').value = 0;
        document.getElementById('popularity-min-label').textContent = '0%';
        document.getElementById('sort-select').value = 'popularity';

        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
            cb.closest('.filter-checkbox')?.classList.remove('checked');
        });

        this.applyFilters();
    }

    // Update stats display
    updateStats() {
        const total = this.stats.total_quotes || 0;
        const filtered = this.filteredQuotes.length;

        if (filtered === 0 && this.filters.categories.length > 0) {
            // Special case: Category selected but no specific quotes loaded yet
            this.quoteCount.textContent = `${total.toLocaleString()} quotes available`;
        } else if (filtered === 0 && this.allQuotes.length === 0) {
            this.quoteCount.textContent = `${total.toLocaleString()} quotes`;
        } else {
            this.quoteCount.textContent = `Showing ${filtered.toLocaleString()} quotes`;
        }
    }

    // Update active filters display
    updateActiveFilters() {
        const pills = [];

        // Search term
        if (this.filters.searchTerm) {
            pills.push(`
        <div class="filter-pill">
          <span>Search: "${this.escapeHtml(this.filters.searchTerm)}"</span>
          <span class="remove" data-remove="search">✕</span>
        </div>
            `);
        }

        // Tags
        this.filters.tags.forEach(tag => {
            pills.push(`
        <div class="filter-pill">
          <span>Tag: ${this.escapeHtml(tag)}</span>
          <span class="remove" data-remove="tag" data-value="${this.escapeHtml(tag)}">✕</span>
        </div>
            `);
        });

        // Categories
        this.filters.categories.forEach(cat => {
            pills.push(`
        <div class="filter-pill">
          <span>Category: ${this.escapeHtml(cat)}</span>
          <span class="remove" data-remove="category" data-value="${this.escapeHtml(cat)}">✕</span>
        </div>
            `);
        });

        // Authors
        this.filters.authors.forEach(author => {
            const cleanAuthor = author.split(',')[0].trim();
            pills.push(`
        <div class="filter-pill">
          <span>Author: ${this.escapeHtml(cleanAuthor)}</span>
          <span class="remove" data-remove="author" data-value="${this.escapeHtml(author)}">✕</span>
        </div>
            `);
        });

        this.activeFiltersContainer.innerHTML = pills.join('');

        // Add remove handlers
        this.activeFiltersContainer.querySelectorAll('.remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.remove;
                const value = e.target.dataset.value;
                this.removeFilter(type, value);
            });
        });
    }

    // Remove filter
    removeFilter(type, value) {
        console.log('Removing filter:', type, value);
        switch (type) {
            case 'search':
                this.filters.searchTerm = '';
                document.getElementById('search-input').value = '';
                break;
            case 'tag':
                this.filters.tags = this.filters.tags.filter(t => t !== value);
                console.log('Remaining tags:', this.filters.tags);
                break;
            case 'category':
                this.filters.categories = this.filters.categories.filter(c => c !== value);
                // Find and uncheck the checkbox
                const catCheckboxes = document.querySelectorAll('input[data-filter="category"]');
                catCheckboxes.forEach(cb => {
                    if (cb.value === value) {
                        cb.checked = false;
                        cb.closest('.filter-checkbox')?.classList.remove('checked');
                    }
                });
                break;
            case 'author':
                this.filters.authors = this.filters.authors.filter(a => a !== value);
                // Find and uncheck the checkbox
                const authorCheckboxes = document.querySelectorAll('input[data-filter="author"]');
                authorCheckboxes.forEach(cb => {
                    if (cb.value === value) {
                        cb.checked = false;
                        cb.closest('.filter-checkbox')?.classList.remove('checked');
                    }
                });
                break;
        }
        this.applyFilters();
    }

    // Escape HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new QuoteCloudApp();
    app.init();
});
