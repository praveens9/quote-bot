#!/usr/bin/env python3
"""
Static Semantic API Generator
Generates static JSON files for the Quote Cloud v2
"""

import json
import os
import shutil
from typing import List, Dict
import chromadb
from sentence_transformers import SentenceTransformer
import gzip

print("=" * 60)
print("STATIC API GENERATOR")
print("=" * 60)

# Configuration
CHROMA_DB_PATH = "./chroma_db"
KEYWORDS_FILE = "keywords.json"
STATS_FILE = "stats.json"
QUOTES_FILE = "data/quotes.json"
API_DIR = "data/api"
QUOTES_API_DIR = os.path.join(API_DIR, "quotes")
TOP_K = 50

# Ensure directories exist
if os.path.exists(API_DIR):
    shutil.rmtree(API_DIR)
os.makedirs(QUOTES_API_DIR)

# Initialize ChromaDB
print("\n[1/4] Connecting to ChromaDB...")
client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
collection = client.get_collection("quotes")
count = collection.count()
print(f"✅ Connected to collection 'quotes' with {count:,} items")

# Load keywords
print("\n[2/4] Loading keywords...")
with open(KEYWORDS_FILE, 'r', encoding='utf-8') as f:
    keywords_by_category = json.load(f)

# Flatten keywords list
all_keywords = set()
for category, keywords in keywords_by_category.items():
    for kw in keywords:
        all_keywords.add(kw['word'])

print(f"✅ Loaded {len(all_keywords)} unique keywords from {len(keywords_by_category)} categories")

# Load embedding model for query encoding
print("   Loading embedding model...")
model = SentenceTransformer('all-MiniLM-L6-v2')

# Generate static files for each keyword
print("\n[3/4] Generating static quote files...")
total_keywords = len(all_keywords)
processed = 0

for keyword in all_keywords:
    processed += 1
    if processed % 50 == 0:
        print(f"   Processing {processed}/{total_keywords}...")
    
    # Generate embedding for keyword
    query_embedding = model.encode(keyword).tolist()
    
    # Query ChromaDB
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=TOP_K,
        include=['documents', 'metadatas']
    )
    
    # Format results
    quotes = []
    for i in range(len(results['ids'][0])):
        quote_data = {
            'id': results['ids'][0][i],
            'quote': results['documents'][0][i],
            'author': results['metadatas'][0][i]['author'],
            'category': results['metadatas'][0][i]['category'],
            'tags': results['metadatas'][0][i]['tags'].split(',') if results['metadatas'][0][i]['tags'] else [],
            'popularity': results['metadatas'][0][i]['popularity']
        }
        quotes.append(quote_data)
    
    # Save to JSON
    filename = os.path.join(QUOTES_API_DIR, f"{keyword}.json")
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(quotes, f, ensure_ascii=False)

print(f"✅ Generated {processed} static files in {QUOTES_API_DIR}")

# Copy keywords and stats
shutil.copy(KEYWORDS_FILE, os.path.join(API_DIR, "keywords.json"))
shutil.copy(STATS_FILE, os.path.join(API_DIR, "stats.json"))

# Generate Full Index for Deep Search
print("\n[4/4] Generating Full Index for Deep Search...")
with open(QUOTES_FILE, 'r', encoding='utf-8') as f:
    all_quotes = json.load(f)

# Create compressed index (minimal fields)
full_index = []
for i, q in enumerate(all_quotes):
    full_index.append({
        'i': i,  # ID
        'q': q['Quote'], # Quote
        'a': q.get('Author', ''), # Author
        'c': q.get('Category', ''), # Category
        't': q.get('Tags', []) # Tags
    })

# Save as standard JSON (browser can handle 22MB if lazy loaded, but let's try to minimize)
# For 48k quotes, this might be around 10-15MB.
index_path = os.path.join(API_DIR, "full_index.json")
with open(index_path, 'w', encoding='utf-8') as f:
    json.dump(full_index, f, ensure_ascii=False)

print(f"✅ Generated full index at {index_path}")
print(f"   Size: {os.path.getsize(index_path) / (1024*1024):.2f} MB")

print("\n" + "=" * 60)
print("STATIC API GENERATION COMPLETE!")
print("=" * 60)
