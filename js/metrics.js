/**
 * Automatically fetch and display impact metrics:
 * - Citation counts from Semantic Scholar API
 * - Dataset downloads from Figshare Stats API
 */

(function() {
    'use strict';

    // Configuration: Map DOIs and Figshare IDs to elements
    const metricsConfig = {
        // Papers with DOIs for citation counts
        papers: [
            {
                doi: '10.1038/s41562-024-01980-y', // Behaviour-derived dimensions
                elementSelector: '[data-metrics-doi="10.1038/s41562-024-01980-y"]'
            },
            {
                doi: '10.7554/eLife.82580', // THINGS-data
                elementSelector: '[data-metrics-doi="10.7554/eLife.82580"]'
            }
        ],
        // Datasets with Figshare IDs for download counts
        datasets: [
            {
                figshareId: '6161151', // THINGS-data collection
                elementSelector: '[data-metrics-figshare="6161151"]'
            },
            {
                figshareId: '20492835', // THINGS-data fMRI Single Trial Responses
                elementSelector: '[data-metrics-figshare="20492835"]'
            }
        ],
        // Author-level metrics
        author: {
            // Google Scholar user ID
            googleScholarUserId: '8eP1AjYAAAAJ',
            totalCitationsSelector: '[data-metrics-total-citations]'
        }
    };

    /**
     * Fetch citation count from Semantic Scholar API
     */
    async function fetchCitationCount(doi) {
        try {
            const response = await fetch(
                `https://api.semanticscholar.org/graph/v1/paper/DOI:${doi}?fields=citationCount`,
                {
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.citationCount || 0;
        } catch (error) {
            console.warn(`Failed to fetch citation count for DOI ${doi}:`, error);
            return null;
        }
    }

    /**
     * Fetch total citations from Google Scholar profile
     * Uses a CORS proxy to bypass browser restrictions
     */
    async function fetchGoogleScholarCitations(userId) {
        try {
            // Try multiple CORS proxy services as fallback
            const proxies = [
                'https://api.allorigins.win/raw?url=',
                'https://corsproxy.io/?',
                'https://api.codetabs.com/v1/proxy?quest='
            ];
            
            const scholarUrl = `https://scholar.google.com/citations?user=${userId}&hl=en`;
            let html = null;
            
            // Try each proxy until one works
            for (const proxy of proxies) {
                try {
                    const proxyUrl = proxy === 'https://api.codetabs.com/v1/proxy?quest=' 
                        ? proxy + encodeURIComponent(scholarUrl)
                        : proxy + encodeURIComponent(scholarUrl);
                    
                    const response = await fetch(proxyUrl, {
                        headers: {
                            'Accept': 'text/html'
                        }
                    });
                    
                    if (response.ok) {
                        html = await response.text();
                        break;
                    }
                } catch (e) {
                    console.log(`Proxy ${proxy} failed, trying next...`);
                    continue;
                }
            }
            
            if (!html) {
                throw new Error('All proxy attempts failed');
            }
            
            // Parse the HTML to find total citations
            // Google Scholar displays it in various formats
            // Pattern 1: "Cited by 123" text
            let match = html.match(/Cited by\s*(\d+)/i);
            if (match) {
                return parseInt(match[1].replace(/,/g, ''), 10);
            }
            
            // Pattern 2: Look for gsc_rsb_st class with citation count
            match = html.match(/gsc_rsb_st[^>]*>[\s\S]*?(\d+)/i);
            if (match) {
                return parseInt(match[1].replace(/,/g, ''), 10);
            }
            
            // Pattern 3: Look for citation count in JSON-LD or structured data
            match = html.match(/"citationCount":\s*(\d+)/i);
            if (match) {
                return parseInt(match[1].replace(/,/g, ''), 10);
            }
            
            // Pattern 4: Look for "Zitiert von" (German) or similar
            match = html.match(/(?:Zitiert von|Cited by|被引用|被引用数)[\s:]*(\d+)/i);
            if (match) {
                return parseInt(match[1].replace(/,/g, ''), 10);
            }
            
            // Pattern 5: Look in the stats table
            match = html.match(/<td[^>]*class="gsc_rsb_std"[^>]*>(\d+)/i);
            if (match) {
                return parseInt(match[1].replace(/,/g, ''), 10);
            }
            
            console.warn('Could not parse citation count from Google Scholar page');
            console.log('HTML snippet:', html.substring(0, 5000)); // Debug: log first 5000 chars
            return null;
        } catch (error) {
            console.warn(`Failed to fetch Google Scholar citations for user ${userId}:`, error);
            return null;
        }
    }

    /**
     * Fetch download count from Figshare Stats API
     */
    async function fetchFigshareDownloads(figshareId, itemType = 'article') {
        const url = `https://stats.figshare.com/total/downloads/${itemType}/${figshareId}`;
        console.log(`Fetching Figshare stats from: ${url}`);
        
        // Try direct fetch first (Figshare should allow CORS)
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                mode: 'cors'
            });
            
            console.log(`Figshare response status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`Figshare response data:`, data);
                
                // Handle both array and number formats
                let totals;
                if (Array.isArray(data.totals)) {
                    totals = data.totals[0];
                } else if (typeof data.totals === 'number') {
                    totals = data.totals;
                } else {
                    console.warn('Unexpected Figshare response format:', data);
                    return null;
                }
                
                // Return 0 if totals is 0, don't use || operator as it would fail for 0
                return totals !== null && totals !== undefined ? totals : 0;
            }
        } catch (error) {
            console.warn(`Direct fetch failed, trying CORS proxy:`, error.message);
        }
        
        // Fallback: try with CORS proxy
        try {
            const proxyUrl = 'https://api.allorigins.win/raw?url=';
            const proxiedUrl = proxyUrl + encodeURIComponent(url);
            
            const response = await fetch(proxiedUrl, {
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`Figshare response data (via proxy):`, data);
                
                let totals;
                if (Array.isArray(data.totals)) {
                    totals = data.totals[0];
                } else if (typeof data.totals === 'number') {
                    totals = data.totals;
                } else {
                    return null;
                }
                
                return totals !== null && totals !== undefined ? totals : 0;
            }
        } catch (error) {
            console.error(`Failed to fetch Figshare downloads for ID ${figshareId}:`, error);
            return null;
        }
        
        return null;
    }

    /**
     * Format number with appropriate suffix (e.g., 1.2k, 5.3M)
     */
    function formatNumber(num) {
        if (num === null || num === undefined) return '';
        if (num === 0) return '0';
        if (num < 1000) return num.toString();
        if (num < 1000000) return (num / 1000).toFixed(1) + 'k';
        return (num / 1000000).toFixed(1) + 'M';
    }

    /**
     * Update element with metric value
     */
    function updateMetric(element, value, label) {
        if (!element || value === null) return;
        
        const formatted = formatNumber(value);
        if (formatted) {
            // If element has existing content, append; otherwise set
            if (element.textContent.trim()) {
                element.textContent += ` · ${label}: ${formatted}`;
            } else {
                element.textContent = `${label}: ${formatted}`;
            }
            element.style.display = '';
        }
    }

    /**
     * Update total citations display
     */
    async function updateTotalCitations() {
        const element = document.querySelector(metricsConfig.author.totalCitationsSelector);
        if (!element) {
            console.error('Total citations element not found!');
            return;
        }

        console.log('Fetching Google Scholar citations...');
        let totalCitations = null;

        // Fetch from Google Scholar if user ID is available
        if (metricsConfig.author.googleScholarUserId) {
            totalCitations = await fetchGoogleScholarCitations(metricsConfig.author.googleScholarUserId);
            console.log('Google Scholar citations result:', totalCitations);
        }

        if (totalCitations !== null && totalCitations !== undefined) {
            const formatted = formatNumber(totalCitations);
            element.textContent = formatted;
            element.style.display = 'inline';
            console.log('Updated citations display:', formatted);
        } else {
            console.warn('Could not fetch total citations, keeping placeholder');
            element.textContent = '—';
            element.style.display = 'inline';
        }
    }

    /**
     * Initialize and fetch all metrics
     */
    async function initMetrics() {
        console.log('Initializing metrics...');
        
        // Fetch citation counts for papers
        for (const paper of metricsConfig.papers) {
            const element = document.querySelector(paper.elementSelector);
            if (element) {
                const citations = await fetchCitationCount(paper.doi);
                updateMetric(element, citations, 'Cited');
            }
        }

        // Fetch download counts for datasets
        for (const dataset of metricsConfig.datasets) {
            const element = document.querySelector(dataset.elementSelector);
            if (!element) {
                console.warn(`Element not found for selector: ${dataset.elementSelector}`);
                continue;
            }
            
            console.log(`Fetching Figshare downloads for ID ${dataset.figshareId}...`);
            const downloads = await fetchFigshareDownloads(dataset.figshareId, 'article');
            console.log(`Figshare downloads result for ${dataset.figshareId}:`, downloads);
            
            if (downloads !== null && downloads !== undefined) {
                const formatted = formatNumber(downloads);
                element.textContent = formatted;
                element.style.display = 'inline';
                console.log(`Updated downloads display for ${dataset.figshareId}:`, formatted);
            } else {
                console.warn(`Could not fetch downloads for Figshare ID ${dataset.figshareId}`);
                element.textContent = '—';
                element.style.display = 'inline';
            }
        }

        // Fetch total citations
        await updateTotalCitations();
        
        console.log('Metrics initialization complete');
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('DOM loaded, initializing metrics...');
            initMetrics();
        });
    } else {
        console.log('DOM already ready, initializing metrics...');
        initMetrics();
    }
    
    // Verify script loaded
    console.log('Metrics.js script loaded successfully');
})();
