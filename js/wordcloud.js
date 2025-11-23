// ===================================
// WORDCLOUD.JS - D3 Wordcloud Rendering
// ===================================

export class WordcloudRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.width = this.container.offsetWidth;
        this.height = this.container.offsetHeight;
        this.onWordClick = null;
        this.onWordHover = null;
        this.selectedWords = new Set();

        // Event Delegation for robust click handling
        this.container.addEventListener('click', (e) => {
            const target = e.target;
            if (target.tagName === 'text' || target.closest('text')) {
                const textNode = target.tagName === 'text' ? target : target.closest('text');
                const d = d3.select(textNode).datum();

                if (d) {
                    console.log('Wordcloud (Delegated): Clicked', d.text);
                    // Visual feedback
                    d3.select(textNode).style("fill", "#ff6b6b");

                    if (this.onWordClick) {
                        this.onWordClick(d, e);
                    }
                }
            }
        });

        // Handle resize
        window.addEventListener('resize', () => {
            this.width = this.container.offsetWidth;
            this.height = this.container.offsetHeight;
        });
    }

    // Render tag cloud
    renderTagCloud(tagData) {
        this.clear();
        this.updateDimensions();

        // Scale font sizes
        const maxSize = Math.max(...tagData.map(d => d.size));
        const minSize = Math.min(...tagData.map(d => d.size));

        const words = tagData.map(d => ({
            ...d,
            size: this.scaleFontSize(d.size, minSize, maxSize)
        }));

        // Create D3 cloud layout with optimized settings
        const layout = d3.layout.cloud()
            .size([this.width, this.height])
            .words(words)
            .padding(5)
            .rotate(0) // No rotation for cleaner look
            .font("Inter")
            .fontSize(d => d.size)
            .on("end", (words) => this.draw(words, this.width, this.height));

        layout.start();
    }

    // Draw function
    draw(words, width, height) {
        const svg = d3.select(this.container).append("svg")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", `translate(${width / 2},${height / 2})`);

        const text = svg.selectAll("text")
            .data(words)
            .enter().append("text")
            .style("font-size", d => `${d.size}px`)
            .style("font-family", "Inter")
            .style("fill", d => this.getCategoryColor(d.category))
            .attr("text-anchor", "middle")
            .attr("transform", d => `translate(${d.x},${d.y})`) // Instant position, no transition
            .text(d => d.text)

        // Animate entrance
        text.style('opacity', 0)
            .transition()
            .duration(800)
            .style('opacity', 1)
            .delay((d, i) => i * 10);
    }

    // Render author constellation
    renderAuthorConstellation(authorData) {
        this.clear();
        this.updateDimensions();

        const svg = d3.select(this.container)
            .append('svg')
            .attr('width', this.width)
            .attr('height', this.height);

        // Create force simulation
        const simulation = d3.forceSimulation(authorData)
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide().radius(d => this.getAuthorRadius(d.quoteCount) + 10));

        // Draw connections (optional - can be enabled later)
        // const links = this.createAuthorLinks(authorData);
        // svg.selectAll('line')
        //   .data(links)
        //   .enter().append('line')
        //   .attr('class', 'author-connection');

        // Draw author nodes
        const nodes = svg.selectAll('g.author-node')
            .data(authorData)
            .enter().append('g')
            .attr('class', 'author-node')
            .style('cursor', 'pointer')
            .on("click", (event, d) => {
                // Visual feedback
                d3.select(event.target).style("fill", "#ff6b6b");

                console.log('Wordcloud: Clicked word', d.text);
                try {
                    if (this.onWordClick) this.onWordClick(d, event);
                } catch (error) {
                    console.error('Wordcloud: Error in onWordClick handler for author:', error);
                }
            })
            .on("mouseenter", (event, d) => {
                // Simple opacity change - no movement
                d3.select(event.currentTarget)
                    .transition().duration(200)
                    .style("opacity", 0.7);

                if (this.onWordHover) this.onWordHover(d, event, true);
            })
            .on("mouseleave", (event, d) => {
                // Restore opacity
                d3.select(event.currentTarget)
                    .transition().duration(200)
                    .style("opacity", 1);

                if (this.onWordHover) this.onWordHover(d, event, false);
            });

        // Add circles
        nodes.append('circle')
            .attr('r', d => this.getAuthorRadius(d.quoteCount))
            .attr('fill', d => this.getCategoryColor(d.category))
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('opacity', 0.8);

        // Add labels
        nodes.append('text')
            .attr('dy', d => this.getAuthorRadius(d.quoteCount) + 15)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#fff')
            .text(d => this.truncateAuthorName(d.name));

        // Update positions on simulation tick
        simulation.on('tick', () => {
            nodes.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Animate entrance
        nodes.style('opacity', 0)
            .transition()
            .duration(800)
            .style('opacity', 1)
            .delay((d, i) => i * 20);
    }

    // Helper: Scale font size
    scaleFontSize(value, min, max) {
        const minFont = 14;
        const maxFont = 72;
        return minFont + ((value - min) / (max - min)) * (maxFont - minFont);
    }

    // Helper: Get author node radius
    getAuthorRadius(quoteCount) {
        const minRadius = 20;
        const maxRadius = 60;
        const scale = Math.log(quoteCount + 1) / Math.log(100);
        return minRadius + (scale * (maxRadius - minRadius));
    }

    // Helper: Truncate author name
    truncateAuthorName(name) {
        // Remove book titles
        const cleanName = name.split(',')[0].trim();
        // Truncate if too long
        return cleanName.length > 20 ? cleanName.substring(0, 17) + '...' : cleanName;
    }

    // Helper: Get category color
    getCategoryColor(category) {
        const colors = {
            life: '#FF6B6B',
            love: '#FF69B4',
            inspiration: '#4ECDC4',
            humor: '#FFD93D',
            philosophy: '#A78BFA',
            wisdom: '#818CF8',
            books: '#34D399',
            truth: '#F59E0B',
            default: '#94A3B8'
        };
        return colors[category] || colors.default;
    }

    // Update dimensions
    updateDimensions() {
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
    }

    // Clear wordcloud
    clear() {
        this.container.innerHTML = '';
    }

    // Set selected words
    setSelectedWords(words) {
        this.selectedWords = new Set(words);
    }
}
