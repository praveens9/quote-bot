// ===================================
// SEARCH-ENGINE.JS - Search & Filter
// ===================================

export class SearchEngine {
    constructor(quotes, indexes) {
        this.allQuotes = quotes;
        this.indexes = indexes;
        this.fuse = null;
        this.initFuse();
    }

    // Initialize Fuse.js for fuzzy search
    initFuse() {
        this.fuse = new Fuse(this.allQuotes, {
            keys: ['q', 'a'], // q=quote, a=author
            threshold: 0.3,
            includeScore: true,
            minMatchCharLength: 3
        });
    }

    // Main search function
    search(searchTerm) {
        const fuseResults = this.fuse.search(searchTerm);

        // Map back to standard quote format
        return fuseResults.map(result => ({
            id: result.item.i,
            Quote: result.item.q,
            Author: result.item.a,
            Tags: result.item.t,
            Category: result.item.c,
            Popularity: 0 // Index doesn't have popularity to save space
        })).slice(0, 50); // Limit results
    }

    // Main filter function (replaces search for complex filters)
    filter(filters) {
        let results = this.allQuotes;

        // 1. Filter by Author
        if (filters.authors && filters.authors.length > 0) {
            results = this.filterByAuthors(results, filters.authors);
        }

        // 2. Filter by Tags
        if (filters.tags && filters.tags.length > 0) {
            results = this.filterByTags(results, filters.tags);
        }

        // 3. Filter by Categories
        if (filters.categories && filters.categories.length > 0) {
            results = this.filterByCategories(results, filters.categories);
        }

        // Map to standard format
        return results.map(item => ({
            id: item.i,
            Quote: item.q,
            Author: item.a,
            Tags: item.t || [],
            Category: item.c || 'default',
            Popularity: 0
        })).slice(0, 50);
    }

    // Filter by tags (AND logic)
    filterByTags(quotes, selectedTags) {
        return quotes.filter(quote => {
            if (!quote.t || !Array.isArray(quote.t)) return false;
            const quoteTags = quote.t.map(t => t.trim().toLowerCase());
            return selectedTags.every(tag => quoteTags.includes(tag.trim().toLowerCase()));
        });
    }

    // Filter by categories (OR logic)
    filterByCategories(quotes, selectedCategories) {
        return quotes.filter(quote => {
            const quoteCategory = (quote.c || '').trim().toLowerCase();
            return selectedCategories.some(cat => cat.toLowerCase() === quoteCategory);
        });
    }

    // Filter by authors (OR logic)
    filterByAuthors(quotes, selectedAuthors) {
        return quotes.filter(quote => selectedAuthors.includes(quote.a));
    }

    // Filter by popularity
    filterByPopularity(quotes, minPopularity) {
        return quotes.filter(quote => {
            const popularity = quote.Popularity || 0;
            return popularity >= minPopularity;
        });
    }

    // Sort quotes
    sortQuotes(quotes, sortBy) {
        const sorted = [...quotes];

        switch (sortBy) {
            case 'popularity':
                return sorted.sort((a, b) =>
                    (b.Popularity || 0) - (a.Popularity || 0)
                );

            case 'author':
                return sorted.sort((a, b) =>
                    (a.Author || '').localeCompare(b.Author || '')
                );

            case 'length':
                return sorted.sort((a, b) =>
                    (a.Quote || '').length - (b.Quote || '').length
                );

            case 'random':
                return sorted.sort(() => Math.random() - 0.5);

            default:
                return sorted;
        }
    }

    // Get quotes by tag
    getQuotesByTag(tag) {
        const cleanTag = tag.trim().toLowerCase();
        const quoteIds = this.indexes.tags[cleanTag] || [];
        return quoteIds.map(id => this.indexes.byId[id]);
    }

    // Get quotes by author
    getQuotesByAuthor(author) {
        const quoteIds = this.indexes.authors[author] || [];
        return quoteIds.map(id => this.indexes.byId[id]);
    }

    // Get quotes by category
    getQuotesByCategory(category) {
        const cleanCategory = category.trim().toLowerCase();
        const quoteIds = this.indexes.categories[cleanCategory] || [];
        return quoteIds.map(id => this.indexes.byId[id]);
    }
}
