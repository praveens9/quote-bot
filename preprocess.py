#!/usr/bin/env python3
"""
Quote Cloud Preprocessing Pipeline
Generates embeddings, extracts impactful keywords, and stores in ChromaDB
"""

import json
import os
from collections import defaultdict, Counter
from typing import List, Dict, Tuple
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import chromadb
from chromadb.config import Settings

print("=" * 60)
print("QUOTE CLOUD PREPROCESSING PIPELINE")
print("=" * 60)

# Configuration
QUOTES_FILE = "data/quotes.json"
CHROMA_DB_PATH = "./chroma_db"
KEYWORDS_OUTPUT = "keywords.json"
STATS_OUTPUT = "stats.json"
TOP_KEYWORDS_PER_CATEGORY = 30
MIN_KEYWORD_FREQUENCY = 3

# Step 1: Load quotes
print("\n[1/6] Loading quotes...")
with open(QUOTES_FILE, 'r', encoding='utf-8') as f:
    raw_quotes = json.load(f)

print(f"   Loaded {len(raw_quotes):,} raw quotes")

# Deduplicate quotes
print("   Deduplicating...")
quotes = []
seen = set()
duplicates = 0

for q in raw_quotes:
    # Create unique key based on quote text and author
    quote_text = q.get('Quote', '').strip()
    author = q.get('Author', '').strip()
    
    if not quote_text:  # Skip empty quotes
        continue
        
    key = (quote_text, author)
    
    if key not in seen:
        seen.add(key)
        quotes.append(q)
    else:
        duplicates += 1

print(f"✅ Deduplicated: {len(quotes):,} unique quotes (removed {duplicates:,} duplicates)")

# Step 2: Clean and organize by category
print("\n[2/6] Organizing by category...")
quotes_by_category = defaultdict(list)
all_categories = set()

for i, quote in enumerate(quotes):
    # Add ID
    quote['id'] = i
    
    # Normalize category
    category = (quote.get('Category') or 'other').strip().lower()
    quote['category_normalized'] = category
    all_categories.add(category)
    
    # Normalize tags
    if quote.get('Tags'):
        quote['tags_normalized'] = [tag.strip().lower() for tag in quote['Tags'] if tag.strip()]
    else:
        quote['tags_normalized'] = []
    
    quotes_by_category[category].append(quote)

print(f"✅ Found {len(all_categories)} categories:")
for cat in sorted(all_categories):
    print(f"   - {cat}: {len(quotes_by_category[cat]):,} quotes")

# Step 3: Generate embeddings
print("\n[3/6] Generating embeddings...")
print("   Loading sentence-transformers model (this may take a minute)...")
model = SentenceTransformer('all-MiniLM-L6-v2')  # Fast, good quality

print("   Encoding quotes...")
quote_texts = [q['Quote'] for q in quotes]
embeddings = model.encode(quote_texts, show_progress_bar=True, batch_size=32)

print(f"✅ Generated {len(embeddings):,} embeddings (shape: {embeddings.shape})")

# Step 4: Extract impactful keywords per category
print("\n[4/6] Extracting impactful keywords per category...")

def extract_keywords_for_category(category: str, category_quotes: List[Dict]) -> List[Dict]:
    """Extract impactful keywords using TF-IDF and tag frequency"""
    
    # Combine quote text and tags for analysis
    texts = []
    tag_counter = Counter()
    
    for q in category_quotes:
        texts.append(q['Quote'])
        tag_counter.update(q['tags_normalized'])
    
    # TF-IDF for quote text
    vectorizer = TfidfVectorizer(
        max_features=100,
        stop_words='english',
        ngram_range=(1, 2),  # unigrams and bigrams
        min_df=2
    )
    
    try:
        tfidf_matrix = vectorizer.fit_transform(texts)
        feature_names = vectorizer.get_feature_names_out()
        
        # Get average TF-IDF scores
        avg_tfidf = np.asarray(tfidf_matrix.mean(axis=0)).flatten()
        tfidf_scores = {feature_names[i]: avg_tfidf[i] for i in range(len(feature_names))}
    except:
        tfidf_scores = {}
    
    # Combine TF-IDF words and tags
    keyword_scores = {}
    
    # Add TF-IDF keywords
    for word, score in tfidf_scores.items():
        keyword_scores[word] = {
            'word': word,
            'tfidf_score': float(score),
            'tag_count': 0,
            'quote_count': 0
        }
    
    # Add tag-based keywords
    for tag, count in tag_counter.items():
        if count >= MIN_KEYWORD_FREQUENCY:
            if tag in keyword_scores:
                keyword_scores[tag]['tag_count'] = count
            else:
                keyword_scores[tag] = {
                    'word': tag,
                    'tfidf_score': 0.0,
                    'tag_count': count,
                    'quote_count': 0
                }
    
    # Count quotes containing each keyword
    for keyword in keyword_scores:
        count = sum(1 for q in category_quotes 
                   if keyword.lower() in q['Quote'].lower() or 
                      keyword.lower() in q['tags_normalized'])
        keyword_scores[keyword]['quote_count'] = count
    
    # Calculate impact score (combination of TF-IDF, tag frequency, and quote count)
    for keyword in keyword_scores.values():
        # Normalize scores
        tfidf_norm = keyword['tfidf_score']
        tag_norm = min(keyword['tag_count'] / 100, 1.0)  # Cap at 100
        quote_norm = min(keyword['quote_count'] / len(category_quotes), 1.0)
        
        # Weighted combination
        keyword['impact'] = round(
            0.4 * tfidf_norm + 
            0.3 * tag_norm + 
            0.3 * quote_norm,
            3
        )
    
    # Sort by impact and take top keywords
    sorted_keywords = sorted(
        keyword_scores.values(),
        key=lambda x: (x['impact'], x['quote_count']),
        reverse=True
    )[:TOP_KEYWORDS_PER_CATEGORY]
    
    # Format output
    return [
        {
            'word': kw['word'],
            'count': kw['quote_count'],
            'impact': kw['impact']
        }
        for kw in sorted_keywords
        if kw['quote_count'] > 0  # Only include keywords with actual quotes
    ]

keywords_by_category = {}
for category in sorted(all_categories):
    print(f"   Processing {category}...")
    keywords = extract_keywords_for_category(category, quotes_by_category[category])
    keywords_by_category[category] = keywords
    print(f"      → {len(keywords)} keywords extracted")

print(f"✅ Extracted keywords for {len(keywords_by_category)} categories")

# Step 5: Store in ChromaDB
print("\n[5/6] Storing in ChromaDB...")

# Initialize ChromaDB
client = chromadb.PersistentClient(path=CHROMA_DB_PATH)

# Delete existing collection if it exists
try:
    client.delete_collection("quotes")
    print("   Deleted existing collection")
except:
    pass

# Create collection
collection = client.create_collection(
    name="quotes",
    metadata={"description": "Quote embeddings for semantic search"}
)

# Add quotes in batches
BATCH_SIZE = 1000
for i in range(0, len(quotes), BATCH_SIZE):
    batch = quotes[i:i+BATCH_SIZE]
    batch_embeddings = embeddings[i:i+BATCH_SIZE]
    
    collection.add(
        ids=[str(q['id']) for q in batch],
        embeddings=batch_embeddings.tolist(),
        documents=[q['Quote'] for q in batch],
        metadatas=[{
            'author': q.get('Author', ''),
            'category': q['category_normalized'],
            'tags': ','.join(q['tags_normalized']),
            'popularity': q.get('Popularity', 0)
        } for q in batch]
    )
    
    print(f"   Added batch {i//BATCH_SIZE + 1}/{(len(quotes)-1)//BATCH_SIZE + 1}")

print(f"✅ Stored {len(quotes):,} quotes in ChromaDB")

# Step 6: Export keywords and stats
print("\n[6/6] Exporting keywords and stats...")

# Save keywords
with open(KEYWORDS_OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(keywords_by_category, f, indent=2, ensure_ascii=False)

print(f"✅ Saved keywords to {KEYWORDS_OUTPUT}")

# Generate stats
stats = {
    'total_quotes': len(quotes),
    'total_categories': len(all_categories),
    'categories': {
        cat: {
            'quote_count': len(quotes_by_category[cat]),
            'keyword_count': len(keywords_by_category[cat])
        }
        for cat in sorted(all_categories)
    },
    'top_authors': dict(Counter(q.get('Author', 'Unknown') for q in quotes).most_common(20)),
    'embedding_model': 'all-MiniLM-L6-v2',
    'embedding_dimensions': embeddings.shape[1]
}

with open(STATS_OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(stats, f, indent=2, ensure_ascii=False)

print(f"✅ Saved stats to {STATS_OUTPUT}")

# Summary
print("\n" + "=" * 60)
print("PREPROCESSING COMPLETE!")
print("=" * 60)
print(f"\n📊 Summary:")
print(f"   • Processed: {stats['total_quotes']:,} quotes")
print(f"   • Categories: {stats['total_categories']}")
print(f"   • Embeddings: {embeddings.shape[1]} dimensions")
print(f"   • Keywords: {sum(len(kw) for kw in keywords_by_category.values())} total")
print(f"\n📁 Output files:")
print(f"   • {CHROMA_DB_PATH}/ - Vector database")
print(f"   • {KEYWORDS_OUTPUT} - Impactful keywords per category")
print(f"   • {STATS_OUTPUT} - Statistics")
print(f"\n✅ Ready for backend API!")
print("=" * 60 + "\n")
