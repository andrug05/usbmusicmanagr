'use strict';

const mgu = require('./kit/mgu');
const scanner = require('./scanner');

const W = 1600;
const H = 520;
const PAGE_ROWS = 7;
const BG = '#080d13';
const PANEL = '#111c27';
const TEXT = '#e9f0f6';
const MUTED = '#91a2b5';
const BLUE = '#58b6ff';
const GREEN = '#5de0a1';
const YELLOW = '#ffd166';

mgu.run({
    async start(ctx) {
        const ui = ctx.ui;
        const log = ctx.log;
        let tracks = [];
        let volumes = [];
        let selected = 0;
        let details = false;
        let busy = false;
        let status = 'Подключите USB и нажмите «Scan USB»';
        let scannedAt = '';

        function safeText(value, max) {
            let s = String(value == null ? '' : value);
            if (s.length > max) s = s.slice(0, max - 1) + '…';
            return s;
        }

        async function render() {
            const cv = ctx.canvas(W, H).clear(BG);
            cv.roundRect(18, 12, W - 36, H - 24, 16, PANEL);
            cv.text('USB MUSIC MANAGER', 48, 52, 25, BLUE, {font:'label', literal:true});
            cv.text(status, 48, 83, 17, busy ? YELLOW : (tracks.length ? GREEN : MUTED), {font:'label', literal:true});
            cv.text('USB: ' + volumes.length + '   MP3: ' + tracks.length, W - 48, 52, 19, TEXT, {font:'label', literal:true, align:'right'});
            if (scannedAt) cv.text('Scan: ' + scannedAt, W - 48, 82, 14, MUTED, {font:'label', literal:true, align:'right'});

            const start = Math.max(0, Math.min(Math.max(0, tracks.length - PAGE_ROWS), selected - Math.floor(PAGE_ROWS / 2)));
            const end = Math.min(tracks.length, start + PAGE_ROWS);
            cv.text('TRACKS', 48, 125, 15, MUTED, {font:'label', literal:true});
            for (let i = start; i < end; i++) {
                const t = tracks[i];
                const y = 145 + (i - start) * 47;
                const active = i === selected;
                cv.roundRect(38, y - 25, details ? 900 : 1480, 40, 7, active ? '#17496a' : '#172431');
                cv.text(String(i + 1).padStart(4, '0'), 55, y, 15, active ? BLUE : MUTED, {font:'label', literal:true});
                cv.text(safeText(t.title || t.name, 66), 120, y, 19, active ? TEXT : '#c6d2de', {font:'label', literal:true});
                cv.text(safeText(t.artist || 'Unknown artist', 35), 820, y, 15, MUTED, {font:'label', literal:true});
                cv.text(safeText(t.album || '', 32), 1120, y, 15, MUTED, {font:'label', literal:true});
                cv.text((i + 1) + '/' + tracks.length, 1500, y, 14, MUTED, {font:'label', literal:true, align:'right'});
            }

            if (!tracks.length && !busy) {
                cv.text('Нажмите Scan USB для поиска музыкальных файлов', 60, 220, 22, MUTED, {font:'label', literal:true});
                cv.text('Поддерживаются MP3. Файлы на USB не изменяются.', 60, 260, 17, MUTED, {font:'label', literal:true});
            }

            if (details && tracks[selected]) {
                const t = tracks[selected];
                cv.roundRect(970, 116, 580, 350, 12, '#0c141d');
                cv.text('TRACK DETAILS', 995, 150, 16, BLUE, {font:'label', literal:true});
                cv.text(safeText(t.title || t.name, 45), 995, 190, 20, TEXT, {font:'label', literal:true});
                cv.text('Artist: ' + safeText(t.artist || '—', 45), 995, 232, 16, MUTED, {font:'label', literal:true});
                cv.text('Album: ' + safeText(t.album || '—', 45), 995, 266, 16, MUTED, {font:'label', literal:true});
                cv.text('Track: ' + safeText(t.track || '—', 15) + '   Year: ' + safeText(t.year || '—', 10), 995, 300, 16, MUTED, {font:'label', literal:true});
                cv.text('Genre: ' + safeText(t.genre || '—', 35), 995, 334, 16, MUTED, {font:'label', literal:true});
                cv.text('Size: ' + (Math.round((t.size || 0) / 1024 / 1024 * 10) / 10) + ' MB', 995, 368, 16, MUTED, {font:'label', literal:true});
                cv.text(safeText(t.path || '', 68), 995, 414, 13, MUTED, {font:'label', literal:true});
            }

            cv.text('READ ONLY  ·  MP3 ONLY  ·  NO FILE CHANGES', 48, 490, 13, MUTED, {font:'label', literal:true});
            await ui.image('MAIN_GFX', cv);
        }

        async function scan() {
            if (busy) return;
            busy = true;
            tracks = [];
            selected = 0;
            details = false;
            status = 'Подготовка сканирования USB…';
            await render();
            try {
                const result = await scanner.scanAllAsync({
                    maxFiles: 5000,
                    maxDepth: 16,
                    maxEntries: 50000,
                    onProgress: function(progress) {
                        status = 'Сканирование… MP3: ' + progress.files +
                            ' · просмотрено: ' + progress.entries;
                        if (progress.entries > 0 && progress.entries % 500 === 0) {
                            render().catch(function(error) {
                                log.error('Progress render failed: ' + error);
                            });
                        }
                    }
                });
                volumes = result.volumes || [];
                tracks = [];
                volumes.forEach(function(volume) {
                    (volume.tracks || []).forEach(function(track) {
                        track.mount = volume.volume && volume.volume.mount ? volume.volume.mount : '';
                        tracks.push(track);
                    });
                });
                tracks.sort(function(a, b) {
                    const aa = String(a.path || '').toLowerCase();
                    const bb = String(b.path || '').toLowerCase();
                    return aa < bb ? -1 : aa > bb ? 1 : 0;
                });
                selected = 0;
                scannedAt = new Date().toLocaleTimeString();
                const truncated = volumes.some(function(v) { return v.truncated; });
                status = truncated
                    ? 'Сканирование завершено: достигнут лимит, найдено MP3: ' + tracks.length
                    : (tracks.length ? 'Сканирование завершено' : 'USB найден, MP3 не обнаружены');
                log.info('USB scan complete: ' + volumes.length + ' volumes, ' + tracks.length + ' MP3');
            } catch (e) {
                tracks = [];
                volumes = [];
                status = 'Ошибка сканирования: ' + safeText(e && e.message ? e.message : e, 80);
                log.error('USB scan failed: ' + (e && e.stack ? e.stack : e));
            } finally {
                busy = false;
                await render();
            }
        }

        ui.onClick('BTN_SCAN', scan);
        ui.onClick('BTN_PREV', function() {
            if (tracks.length) selected = (selected - 1 + tracks.length) % tracks.length;
            render();
        });
        ui.onClick('BTN_NEXT', function() {
            if (tracks.length) selected = (selected + 1) % tracks.length;
            render();
        });
        ui.onClick('BTN_INFO', function() {
            details = !details;
            render();
        });
        ui.onVisible(function(name, visible) {
            if (name === 'MAIN' && visible) render();
        });

        // Do not perform a synchronous recursive USB scan during process startup:
        // on large drives this can block OAP before the first frame is displayed.
        await render();
        log.info('USB Music Manager 0.1.3 started; waiting for user scan request');
    }
});
