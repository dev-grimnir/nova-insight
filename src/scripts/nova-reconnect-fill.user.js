// ==UserScript==
// @name         nova-reconnect-fill
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Fills reconnect time for "Start" rows as colored bold text in h/m/s, keeps existing session time on "Stop" rows
// @author       Grok
// @match        https://admin.neonova.net/index.php*
// @match        https://admin.neonova.net/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/dev-grimnir/nova-insight/main/src/scripts/nova-reconnect-fill.user.js
// @downloadURL  https://raw.githubusercontent.com/dev-grimnir/nova-insight/main/src/scripts/nova-reconnect-fill.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Find the data table by header text
    const table = Array.from(document.querySelectorAll('table'))
        .find(t => t.innerHTML.includes('Session<br>Time'));

    if (!table) return;

    const rows = Array.from(table.querySelectorAll('tbody tr'));

    let lastStopTime = null;

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 7) return;

        const dateCell = cells[0];
        const statusCell = cells[4];
        const timeCell = cells[6]; // Session Time column

        const dateStr = dateCell.textContent.trim();
        const status = statusCell.textContent.trim();

        if (dateStr && (status === "Start" || status === "Stop")) {
            const currentTime = new Date(dateStr.replace(' ', 'T'));

            if (isNaN(currentTime.getTime())) return;

            if (status === "Stop") {
                lastStopTime = currentTime;
                // Do nothing - keep existing session time
            } else if (status === "Start") {
                if (lastStopTime) {
                    const diffMs = currentTime - lastStopTime;
                    if (diffMs >= 0) {
                        const totalSeconds = Math.floor(diffMs / 1000);
                        const hours = Math.floor(totalSeconds / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = totalSeconds % 60;

                        // Build formatted string
                        let timeStr = '';
                        if (hours > 0) timeStr += `${hours}h `;
                        if (hours > 0 || minutes > 0) timeStr += `${minutes}m `;
                        timeStr += `${seconds}s`;

                        // Color logic based on total minutes
                        const totalMinutes = Math.floor(diffMs / 60000);
                        let color = 'green';
                        if (totalMinutes > 10) {
                            color = 'red';
                        } else if (totalMinutes > 5) {
                            color = '#b8860b'; // dark goldenrod
                        }

                        timeCell.innerHTML = `<span style="font-weight: bold; color: ${color};">${timeStr.trim()}</span>`;
                    }
                } else {
                    timeCell.innerHTML = '';
                }
            }
        }
    });
})();
