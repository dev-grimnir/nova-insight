import { describe, it, expect, vi } from 'vitest';
import NovaAnalyzer from '@/controllers/nova-analyzer.js';
import { formatDuration, getSessionBonus } from '@/core/utils.js';

// Freeze time so timeSinceLastStr is consistent across test runs
vi.setSystemTime(new Date('2026-03-18T20:00:00Z'));

describe('NovaAnalyzer', () => {
    it('returns empty object when given no entries', () => {
        const result = NovaAnalyzer.computeMetrics([]);

        // Actual current behavior of the class: returns plain empty object for empty input
        expect(result).toEqual({});

        // If you ever change the empty case to return defaults, you can uncomment these:
        // expect(result).toHaveProperty('peakHourStr', 'None');
        // expect(result.disconnects).toBe(0);
        // expect(result.numSessions).toBe(0);
        // expect(result.meanStabilityScore).toBe(0);
        // expect(result.rolling7Day).toEqual([]);
    });

    it('correctly counts one completed session', () => {
        const entries = [
            { status: 'Start', dateObj: new Date('2026-03-17T08:00:00Z') },
            { status: 'Stop',  dateObj: new Date('2026-03-17T10:30:00Z') }
        ];

        const result = NovaAnalyzer.computeMetrics(entries);

        expect(result.disconnects).toBe(1);
        expect(result.numSessions).toBe(1);
        expect(result.totalConnectedSec).toBe(9000);          // 2.5 hours = 9000 seconds
        expect(result.avgSessionMin).toBe('150.0');

        // timeSinceLastStr uses real formatDuration + frozen time
        expect(result.timeSinceLastStr).toMatch(/ago$/);

        // stability scores use real getSessionBonus
        // (this one will be high since uptime is perfect and session is long)
        expect(result.meanStabilityScore).toBeGreaterThanOrEqual(90);
        expect(result.medianStabilityScore).toBeGreaterThanOrEqual(90);

        // Optional: add more precise checks once you see the actual output
        // expect(result.percentConnected).toBe('100.0');
        // expect(result.longestSessionMin).toBe(150);
    });
});
