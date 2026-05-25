// src/controllers/NovaHTTPController.js

class NovaHTTPController {
    /**************************************************************************
     * STATIC PROPERTIES
     **************************************************************************/

    static baseSearchUrl = 'https://admin.neonova.net/rat/index.php';

    static defaultFormData = {
        ip: '',
        session: '',
        nasip: '',
        statusview: 'both',
        sd: 'fairpoint.net',
        shour: '00',
        smin: '00',
        emonth: '',
        eday: '',
        eyear: '',
        ehour: '',
        emin: '',
        hits: '50',
        order: 'date',
        submit: 'Search'
    };

    /**************************************************************************
     * STATIC PRIVATE METHODS — declared first for Tampermonkey compatibility
     **************************************************************************/

    static #buildPaginationParams(
        username, 
        sDate, 
        eDate, 
        hitsPerPage, 
        offset,
        // New parameters (can be null)
        startHour = null,
        startMinute = null,
        endHour = null,
        endMinute = null) {
        
        const params = new URLSearchParams({
            acctsearch: '2',
            sd: 'fairpoint.net',
            iuserid: username,
            ip: '',
            session: '',
            nasip: '',
            statusview: 'both',
            
            // Start date (always filled)
            syear: sDate.getFullYear().toString(),
            smonth: (sDate.getMonth() + 1).toString().padStart(2, '0'),
            sday: sDate.getDate().toString().padStart(2, '0'),
            
            // Start time - use provided values or default to 00:00
            shour: (startHour !== null ? startHour : 0).toString().padStart(2, '0'),
            smin:  (startMinute !== null ? startMinute : 0).toString().padStart(2, '0'),
    
            order: 'date',
            hits: hitsPerPage.toString(),
            location: offset.toString(),
            direction: '0',
            dump: ''
        });
    
        // === End date handling (keep your critical logic) ===
        const now = new Date();
        const isToday = eDate.getFullYear() === now.getFullYear() &&
                        eDate.getMonth() === now.getMonth() &&
                        eDate.getDate() === now.getDate();
    
        if (!eDate || isToday) {
            // Blank end fields = "up to now" (your original special case)
            params.append('eyear', '');
            params.append('emonth', '');
            params.append('eday', '');
            params.append('ehour', '');
            params.append('emin', '');
        } else {
            // Explicit end date → use provided endHour/endMinute or default to 23:59
            params.append('eyear', eDate.getFullYear().toString());
            params.append('emonth', (eDate.getMonth() + 1).toString().padStart(2, '0'));
            params.append('eday', eDate.getDate().toString().padStart(2, '0'));
            
            const finalEndHour = (endHour !== null ? endHour : 23);
            const finalEndMinute = (endMinute !== null ? endMinute : 59);
            
            params.append('ehour', finalEndHour.toString().padStart(2, '0'));
            params.append('emin', finalEndMinute.toString().padStart(2, '0'));
        }
    
        return params;
    }

    static #buildPageUrl(params) {
        return `${this.baseSearchUrl}?${params.toString()}`;
    }

    /**
     * Fetches a page — returns HTML string or null on HTTP error.
     * Throws on network errors or AbortError (handled by caller).
     */
    static async #fetchPageHtml(url, signal = null) {
        const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-cache',
            headers: {
                'Referer': url,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Upgrade-Insecure-Requests': '1'
            },
            signal
        });

        if (!res.ok) {
            console.warn(`HTTP ${res.status} while fetching pagination page`);
            return null;
        }

        return await res.text();
    }

    /**
     * Extracts the total entry count from the gray header row on the first results page.
     * Returns a number or null if the header is missing/not parsable.
     */
    static #extractTotalEntries(doc) {
        const bodyText = doc.body.textContent || '';
        const headerText = bodyText.substring(0, 10000);  // Wider search — header can be lower
    
        // More precise patterns based on your manual table
        const patterns = [
            /Entry:\s*\d+-\d+\s*of\s*([\d,]+)/i,               // "Entry: 1-100 of 1775"
            /of\s*([\d,]+)\s*(?![^\s]*\d)/i,                  // "of 1775" not followed by more numbers
            /Results.*?of\s*([\d,]+)/i,
            /Displaying.*?of\s*([\d,]+)/i,
            /Total.*?([\d,]+)/i
        ];
    
        for (const regex of patterns) {
            const match = headerText.match(regex);
            if (match && match[1]) {
                const cleaned = match[1].replace(/,/g, '');
                const total = parseInt(cleaned, 10);
                if (!isNaN(total) && total > 0) {
                    return total;
                }
            }
        }
    
        return null;
    }

    static #parsePageRows(doc) {
        const table = doc.querySelector('table[width="500"]') || doc.querySelector('table[cellspacing="2"][cellpadding="2"]');
        if (!table) return [];
    
        const rows = Array.from(table.querySelectorAll('tr'));
        const entries = [];

        Array.from(table.rows).slice(1).forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 7) return;
    
            const timestampStr = cells[0].textContent.trim();
            const status = cells[4].textContent.trim();
            const sessionTime = cells[6].textContent.trim();
    
            // Parse as local time: browser assumes the string is in your timezone (EST)
            const dateObj = new Date(timestampStr.replace(' ', 'T'));
    
            if (isNaN(dateObj.getTime())) {
                console.warn('[#parsePageRows] Invalid date parse:', timestampStr);
                return;
            }
    
            entries.push({
                timestamp: timestampStr,
                status,
                sessionTime,
                dateObj
            });
        });
    
        return entries;
    }

    /**************************************************************************
     * STATIC PUBLIC METHODS
     **************************************************************************/

    static getSearchUrl(username) {
        const now = new Date();
        const currentYear = now.getFullYear().toString();
        const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');

        const params = new URLSearchParams({
            acctsearch: '2',
            sd: 'fairpoint.net',
            iuserid: username,
            ip: '',
            session: '',
            nasip: '',
            statusview: 'both',
            syear: currentYear,
            smonth: currentMonth,
            sday: '01',
            shour: '00',
            smin: '00',
            emonth: '',
            eday: '',
            eyear: '',
            ehour: '',
            emin: '',
            hits: '50',
            order: 'date',
            location: '0',
            direction: '1',
            dump: ''
        });

        return `https://admin.neonova.net/rat/index.php?${params.toString()}`;
    }

    /**
     * paginateReportLogs — now with:
     *   • Total count scraped from first page and passed to onProgress as 3rd arg
     *   • AbortSignal support for cancellation (pass as final argument)
     *   • Returns the entries array directly
     *   • Backward-compatible: old onProgress handlers ignoring the 3rd arg still work
     */
    static async paginateReportLogs(
        username,
        startDate = null,
        endDate = null,
        startHour = null,
        startMinute = null,
        endHour = null,
        endMinute = null,
        onProgress = null,
        signal = null
    ) {
        // Legacy argument handling for backward compatibility
        if (typeof startDate === 'function') {
            onProgress = startDate;
            startDate = endDate = null;
            startHour = startMinute = endHour = endMinute = null;
            signal = null;
        } else if (typeof endDate === 'function') {
            onProgress = endDate;
            endDate = null;
            startHour = startMinute = endHour = endMinute = null;
            signal = null;
        } else if (typeof startHour === 'function') {
            onProgress = startHour;
            startHour = startMinute = endHour = endMinute = null;
            signal = null;
        }
    
        const now = new Date();
    
        // Build start date + time
        let sDate;
        if (startDate) {
            sDate = new Date(startDate);
        } else {
            sDate = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
        }
    
        // Apply custom start hour/minute if provided
        if (startHour !== null) {
            sDate.setHours(
                Number(startHour),
                Number(startMinute ?? 0),
                0,
                0
            );
        } else if (!startDate) {
            sDate.setHours(0, 0, 0, 0); // default to midnight for month start
        }
    
        // Build end date + time
        let eDate;
        if (endDate) {
            eDate = new Date(endDate);
        } else {
            eDate = new Date(now); // default to current time
        }
    
        // Apply custom end hour/minute if provided
        if (endHour !== null) {
            eDate.setHours(
                Number(endHour),
                Number(endMinute ?? 59),
                59,
                999
            );
        }
        // If no endHour provided and no endDate was given, eDate keeps current time
    
        const hitsPerPage = 100;
        const entries = [];
        let offset = 0;
        let page = 1;
        let total = null;
    
        while (true) {
            // Pass the new time parameters to buildPaginationParams
            const params = this.#buildPaginationParams(
                username,
                sDate,
                eDate,
                hitsPerPage,
                offset,
                startHour,
                startMinute,
                endHour,
                endMinute
            );
    
            const url = this.#buildPageUrl(params);
    
            let html;
            try {
                html = await this.#fetchPageHtml(url, signal);
            } catch (err) {
                if (err.name === 'AbortError') {
                    entries.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
                    return entries;
                }
                console.warn('Unexpected error fetching page:', err);
                break;
            }
    
            if (html === null) {
                console.warn('[paginateReportLogs] HTTP error on page', page, '- stopping');
                break;
            }
    
            const doc = new DOMParser().parseFromString(html, 'text/html');
    
            if (page === 1 && total === null) {
                total = this.#extractTotalEntries(doc);
                if (total === null) {
                    return null;
                }
            }
    
            const pageEntries = this.#parsePageRows(doc);
            entries.push(...pageEntries);
    
            if (typeof onProgress === 'function') {
                onProgress(entries.length, page, total);
            }
    
            if (pageEntries.length < hitsPerPage) {
                break;
            }
    
            offset += hitsPerPage;
            page++;
        }
    
        return entries;
    }

    static async getLatestEntry(username, sinceDate = null) {
        try {
            const now = new Date();
            let startDate = new Date(now.getTime() - (30 * 24 * 3600 * 1000));  // Default: 30 days
    
            if (sinceDate instanceof Date && !isNaN(sinceDate.getTime())) {
                const elapsedHours = (now.getTime() - sinceDate.getTime()) / (3600 * 1000);
                let bufferHours;
                if (elapsedHours < 1) {
                    bufferHours = 0.1667;  // ~10 min
                } else if (elapsedHours < 24) {
                    bufferHours = 1;
                } else {
                    bufferHours = 24;
                }
                startDate = new Date(sinceDate.getTime() - bufferHours * 3600 * 1000);
            }
    
            const entries = await this.paginateReportLogs(
                username,
                startDate,
                now
            );
    
            if (entries === null) {
                return null;
            }
    
            // Trust server's order: last entry is newest
            const newest = entries[entries.length - 1];
    
            return newest;
        } catch (err) {
            console.error('[getLatestEntry] failed:', err);
            return null;
        }
    }

}
