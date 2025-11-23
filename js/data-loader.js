// ===================================
// DATA-LOADER.JS - Load & Cache Quotes
// ===================================

export class DataLoader {
  constructor() {
    this.keywords = {};
    this.stats = {};
    this.fullIndex = null;
    this.cache = new Map(); // Memory cache for loaded keyword files
    this.VERSION_KEY = 'data_version';
    this.QUOTES_KEY = 'all_quotes';
    this.INDEXES_KEY = 'search_indexes';
  }

  // Initialize IndexedDB
  async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
    });
  }

  // Save to IndexedDB
  async saveToIndexedDB(key, data) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.put(data, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Get from IndexedDB
  async getFromIndexedDB(key) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Load initial data (keywords and stats)
  async loadInitialData() {
    console.log('DataLoader: Loading initial data...');
    try {
      // Load keywords
      console.log('DataLoader: Fetching keywords...');
      const keywordsResponse = await fetch('data/api/keywords.json');
      console.log('DataLoader: Keywords response status:', keywordsResponse.status);

      if (!keywordsResponse.ok) {
        throw new Error(`Failed to fetch keywords: ${keywordsResponse.status} ${keywordsResponse.statusText}`);
      }

      this.keywords = await keywordsResponse.json();
      console.log('DataLoader: Keywords loaded:', Object.keys(this.keywords).length, 'categories');

      // Load stats
      console.log('DataLoader: Fetching stats...');
      const statsResponse = await fetch('data/api/stats.json');
      console.log('DataLoader: Stats response status:', statsResponse.status);

      if (!statsResponse.ok) {
        throw new Error(`Failed to fetch stats: ${statsResponse.status} ${statsResponse.statusText}`);
      }

      this.stats = await statsResponse.json();
      console.log('DataLoader: Stats loaded');

      return {
        keywords: this.keywords,
        stats: this.stats
      };
    } catch (error) {
      console.error('Error loading initial data:', error);
      throw error;
    }
  }

  // Fetch quotes for a specific keyword (Static API)
  async getQuotesForKeyword(keyword) {
    try {
      // Check cache first
      if (this.cache.has(keyword)) {
        return this.cache.get(keyword);
      }

      const response = await fetch(`data/api/quotes/${keyword}.json`);
      if (!response.ok) throw new Error(`Failed to load quotes for ${keyword}`);

      const quotes = await response.json();
      this.cache.set(keyword, quotes);
      return quotes;
    } catch (error) {
      console.error(`Error loading quotes for ${keyword}:`, error);
      return [];
    }
  }

  // Lazy load full index for Deep Search
  async loadFullIndex() {
    if (this.fullIndex) return this.fullIndex;

    try {
      const response = await fetch('data/api/full_index.json');
      this.fullIndex = await response.json();
      return this.fullIndex;
    } catch (error) {
      console.error('Error loading full index:', error);
      return [];
    }
  }

  // Load quotes with caching
  async loadQuotes(onProgress) {
    try {
      // Check cache first
      onProgress('Checking cache...', 10);
      const cachedQuotes = await this.getFromIndexedDB(this.QUOTES_KEY);

      if (cachedQuotes) {
        console.log('✅ Loaded from IndexedDB cache');
        onProgress('Loaded from cache', 100);
        return cachedQuotes;
      }

      // Not cached - fetch from server
      onProgress('Downloading quotes...', 30);
      const response = await fetch('data/quotes.json');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} `);
      }

      onProgress('Parsing data...', 60);
      const quotes = await response.json();

      // Deduplicate quotes (same quote text + author)
      const uniqueQuotes = this.deduplicateQuotes(quotes);

      onProgress('Caching for next time...', 80);
      // Store in IndexedDB for next time
      await this.saveToIndexedDB(this.QUOTES_KEY, uniqueQuotes);

      onProgress('Ready!', 100);
      console.log(`✅ Loaded ${uniqueQuotes.length} quotes from server`);

      return uniqueQuotes;
    } catch (error) {
      console.error('Error loading quotes:', error);
      throw error;
    }
  }

  // Deduplicate quotes
  deduplicateQuotes(quotes) {
    const seen = new Set();
    return quotes.filter(quote => {
      const key = `${quote.Quote}| ${quote.Author} `;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // Build search indexes
  buildIndexes(quotes) {
    console.log('Building search indexes...');
    const startTime = performance.now();

    const indexes = {
      tags: {},
      authors: {},
      categories: {},
      byId: {}
    };

    quotes.forEach((quote, index) => {
      // Add ID to quote
      quote.id = index;
      indexes.byId[index] = quote;

      // Index by tags
      if (quote.Tags && Array.isArray(quote.Tags)) {
        quote.Tags.forEach(tag => {
          const cleanTag = tag.trim().toLowerCase();
          if (!cleanTag) return;

          if (!indexes.tags[cleanTag]) {
            indexes.tags[cleanTag] = [];
          }
          indexes.tags[cleanTag].push(index);
        });
      }

      // Index by author
      if (quote.Author) {
        const author = quote.Author.trim();
        if (!indexes.authors[author]) {
          indexes.authors[author] = [];
        }
        indexes.authors[author].push(index);
      }

      // Index by category
      if (quote.Category) {
        const category = quote.Category.trim().toLowerCase();
        if (!indexes.categories[category]) {
          indexes.categories[category] = [];
        }
        indexes.categories[category].push(index);
      }
    });

    const endTime = performance.now();
    console.log(`✅ Indexes built in ${(endTime - startTime).toFixed(2)} ms`);
    console.log(`   - ${Object.keys(indexes.tags).length} unique tags`);
    console.log(`   - ${Object.keys(indexes.authors).length} unique authors`);
    console.log(`   - ${Object.keys(indexes.categories).length} categories`);

    return indexes;
  }

  // Calculate tag frequencies
  calculateTagFrequencies(indexes) {
    const tagFrequencies = [];

    for (const [tag, quoteIds] of Object.entries(indexes.tags)) {
      // Get most common category for this tag
      const categories = {};
      quoteIds.forEach(id => {
        const quote = indexes.byId[id];
        const cat = quote.Category || 'default';
        categories[cat] = (categories[cat] || 0) + 1;
      });

      const mostCommonCategory = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])[0][0];

      tagFrequencies.push({
        text: tag,
        size: quoteIds.length,
        category: mostCommonCategory,
        quoteIds: quoteIds
      });
    }

    // Sort by frequency and take top 50 for better performance
    return tagFrequencies
      .sort((a, b) => b.size - a.size)
      .slice(0, 50);
  }

  // Calculate author statistics
  calculateAuthorStats(indexes) {
    const authorStats = [];

    for (const [author, quoteIds] of Object.entries(indexes.authors)) {
      // Get most popular quote
      const quotes = quoteIds.map(id => indexes.byId[id]);
      const topQuote = quotes.sort((a, b) =>
        (b.Popularity || 0) - (a.Popularity || 0)
      )[0];

      // Get most common category
      const categories = {};
      quotes.forEach(quote => {
        const cat = quote.Category || 'default';
        categories[cat] = (categories[cat] || 0) + 1;
      });

      const mostCommonCategory = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])[0][0];

      authorStats.push({
        name: author,
        quoteCount: quoteIds.length,
        topQuote: topQuote,
        category: mostCommonCategory,
        quoteIds: quoteIds
      });
    }

    return authorStats.sort((a, b) => b.quoteCount - a.quoteCount);
  }

  // Clear cache
  async clearCache() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('✅ Cache cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }
}
