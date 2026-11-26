'use strict';

const mgu = require('./kit/mgu');
const scanner = require('./scanner');
const filemanager = require('./filemanager');
const tagwriter = require('./tagwriter');

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
        const signals = ctx.signals;
        let tracks = [];
        let volumes = [];
        let selected = 0;
        let details = false;
        let busy = false;
        let status = 'Подключите USB и нажмите «Scan USB»';
        let scannedAt = '';
        let sortMode = 0;
        let viewMode = 0;
        let activeFilter = null;
        const viewModes = ['Треки', 'Исполнители', 'Альбомы', 'Папки'];
        let browseItems = [];
        let nowSnapshot = null;
        let nowError = '';
        let nowBusy = false;
        let trashItems = [];
        let trashMount = '';
        let trashSelected = 0;
        let trashStatus = 'Корзина USB';
        let editTrack = null;
        let editMount = '';
        let editFields = [];
        let editField = 0;
        let editLayout = 'RU';
        let editStatus = '';
        const sortModes = [
            {label:'Путь', field:'path'},
            {label:'Название', field:'title'},
            {label:'Исполнитель', field:'artist'},
            {label:'Альбом', field:'album'}
        ];

        function sortTracks() {
            const field = sortModes[sortMode].field;
            tracks.sort(function(a, b) {
                const aa = String(a[field] || a.name || '').toLowerCase();
                const bb = String(b[field] || b.name || '').toLowerCase();
                if (aa < bb) return -1;
                if (aa > bb) return 1;
                const ap = String(a.path || '').toLowerCase();
                const bp = String(b.path || '').toLowerCase();
                return ap < bp ? -1 : ap > bp ? 1 : 0;
            });
        }

        function buildBrowseItems() {
            const map = Object.create(null);
            const mode = viewModes[viewMode];
            tracks.forEach(function(t) {
                let key = '';
                if (mode === 'Исполнители') key = t.artist || 'Unknown artist';
                else if (mode === 'Альбомы') key = (t.artist || 'Unknown artist') + ' — ' + (t.album || 'Unknown album');
                else if (mode === 'Папки') {
                    const p = String(t.path || '');
                    const root = String(t.mount || '');
                    key = p.indexOf(root) === 0 ? p.slice(root.length).replace(/^\/+/, '').split('/').slice(0, -1).join('/') : '';
                    key = key || '/';
                }
                if (!key) return;
                if (!map[key]) map[key] = {label:key, count:0, artist:t.artist || '', album:t.album || '', folder:key};
                map[key].count++;
            });
            browseItems = Object.keys(map).sort(function(a,b) {
                return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0;
            }).map(function(k) { return map[k]; });
        }

        function currentTracks() {
            if (!activeFilter) return tracks;
            return tracks.filter(function(t) {
                if (activeFilter.type === 'Исполнители') return (t.artist || 'Unknown artist') === activeFilter.value;
                if (activeFilter.type === 'Альбомы') return (t.artist || 'Unknown artist') + ' — ' + (t.album || 'Unknown album') === activeFilter.value;
                if (activeFilter.type === 'Папки') {
                    const p = String(t.path || ''), root = String(t.mount || '');
                    const folder = p.indexOf(root) === 0 ? p.slice(root.length).replace(/^\/+/, '').split('/').slice(0, -1).join('/') : '';
                    return (folder || '/') === activeFilter.value;
                }
                return true;
            });
        }

        function safeText(value, max) {
            let s = String(value == null ? '' : value);
            if (s.length > max) s = s.slice(0, max - 1) + '…';
            return s;
        }

        function asArray(value) {
            if (Array.isArray(value)) return value;
            if (value && typeof value === 'object') {
                const keys = Object.keys(value);
                for (let i = 0; i < keys.length; i++) {
                    if (Array.isArray(value[keys[i]])) return value[keys[i]];
                }
            }
            return [];
        }

        async function refreshNowPlaying() {
            if (nowBusy) return;
            nowBusy = true;
            nowError = '';
            await renderNowPlaying();
            let proxy = null;
            try {
                proxy = await signals.proxy('org.genivi.am.commandinterface.CommandControl', '1');
                await new Promise(function(resolve, reject) {
                    let settled = false;
                    const timer = setTimeout(function() {
                        if (!settled) { settled = true; reject(new Error('AudioManager не отвечает')); }
                    }, 6000);
                    signals.onAvailable(proxy, function(available) {
                        if (available && !settled) {
                            settled = true;
                            clearTimeout(timer);
                            resolve();
                        }
                    }).catch(function(error) {
                        if (!settled) { settled = true; clearTimeout(timer); reject(error); }
                    });
                });
                const values = await Promise.all([
                    signals.call(proxy, 'getListMainSources', {}, 5000),
                    signals.call(proxy, 'getListMainSinks', {}, 5000),
                    signals.call(proxy, 'getListMainConnections', {}, 5000)
                ]);
                nowSnapshot = {
                    sources: asArray(values[0]),
                    sinks: asArray(values[1]),
                    connections: asArray(values[2]),
                    checkedAt: new Date().toLocaleTimeString()
                };
                log.info('Media source probe: ' + JSON.stringify(nowSnapshot));
            } catch (error) {
                nowError = safeText(error && error.message ? error.message : error, 100);
                log.warn('Media source probe failed: ' + nowError);
            } finally {
                nowBusy = false;
                await renderNowPlaying();
            }
        }

        async function loadTrash(mount) {
            trashMount = mount || trashMount || (volumes[0] && volumes[0].volume && volumes[0].volume.mount) || '';
            if (!trashMount) { trashItems = []; trashStatus = 'Сначала выполните Scan USB'; return; }
            try {
                trashItems = filemanager.listTrash(trashMount);
                trashStatus = 'В корзине: ' + trashItems.length + ' файлов';
                trashSelected = Math.max(0, Math.min(trashSelected, trashItems.length - 1));
            } catch (error) {
                trashStatus = 'Ошибка корзины: ' + safeText(error.message || error, 80);
                trashItems = [];
            }
        }

        const tagFieldDefs = [
            {key:'title', label:'Название'},
            {key:'artist', label:'Исполнитель'},
            {key:'album', label:'Альбом'},
            {key:'track', label:'Номер трека'},
            {key:'year', label:'Год'},
            {key:'genre', label:'Жанр'}
        ];
        const keyboardLayouts = {
            RU: ['йцукенгшщзх', 'фывапролджэ', 'ячсмитьбю'],
            EN: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
        };
        function openTagEditor() {
            if (viewMode !== 0 || !currentTracks()[selected]) { status = 'Выберите трек в режиме Tracks'; render(); return; }
            editTrack = currentTracks()[selected];
            editMount = editTrack.mount || (volumes[0] && volumes[0].volume && volumes[0].volume.mount) || '';
            if (!editMount) { status = 'Не удалось определить USB'; render(); return; }
            const readOnly = volumes.some(function(v) { return v.volume && v.volume.mount === editMount && v.volume.readOnly; });
            if (readOnly) { status = 'USB смонтирован только для чтения'; render(); return; }
            editFields = tagFieldDefs.map(function(f) { return String(editTrack[f.key] || ''); });
            editField = 0;
            editStatus = 'Выберите поле и вводите текст клавишами на экране';
            ui.open('EDIT').then(renderTagEditor);
        }
        async function renderTagEditor() {
            const cv = ctx.canvas(W, H).clear(BG);
            cv.roundRect(18, 12, W - 36, H - 24, 16, PANEL);
            cv.text('РЕДАКТОР ID3', 48, 48, 25, BLUE, {font:'label', literal:true});
            cv.text(safeText(editTrack ? editTrack.name : '', 80), 48, 76, 15, MUTED, {font:'label', literal:true});
            tagFieldDefs.forEach(function(f, i) {
                const y = 112 + i * 29;
                const active = i === editField;
                cv.roundRect(42, y - 20, 1510, 25, 5, active ? '#17496a' : '#172431');
                cv.text(f.label, 58, y, 16, active ? BLUE : MUTED, {font:'label', literal:true});
                cv.text(safeText(editFields[i] || '—', 90), 330, y, 17, TEXT, {font:'label', literal:true});
            });
            cv.text('Клавиатура: ' + editLayout + '   ·   Поле: ' + tagFieldDefs[editField].label, 48, 306, 15, YELLOW, {font:'label', literal:true});
            const rows = keyboardLayouts[editLayout];
            rows.forEach(function(row, ri) {
                const keyW = 78, gap = 8;
                const total = row.length * keyW + (row.length - 1) * gap;
                const startX = (W - total) / 2;
                for (let i = 0; i < row.length; i++) {
                    const x = startX + i * (keyW + gap);
                    const y = 338 + ri * 47;
                    cv.roundRect(x, y - 25, keyW, 37, 6, '#26384a');
                    cv.text(row.charAt(i), x + keyW / 2, y, 20, TEXT, {font:'label', literal:true, align:'center'});
                }
            });
            cv.text('SPACE', 510, 484, 15, TEXT, {font:'label', literal:true});
            cv.text('⌫', 650, 484, 18, TEXT, {font:'label', literal:true});
            cv.text('CLEAR', 790, 484, 15, TEXT, {font:'label', literal:true});
            cv.text('123 / . - _', 920, 484, 15, TEXT, {font:'label', literal:true});
            cv.text(editStatus, 48, 510, 13, MUTED, {font:'label', literal:true});
            await ui.image('EDIT_GFX', cv);
        }
        async function saveTagEditor() {
            if (!editTrack || !editMount) return;
            try {
                const values = {};
                tagFieldDefs.forEach(function(f, i) { values[f.key] = editFields[i]; });
                const result = tagwriter.writeTags(editTrack.path, editMount, values);
                Object.keys(values).forEach(function(k) { editTrack[k] = values[k]; });
                editTrack.size = result.size;
                editStatus = 'Сохранено. Резервная копия: .umm_tag_backup';
                status = 'ID3-теги сохранены; копия исходного MP3 создана';
                log.info('ID3 tags saved: ' + editTrack.path + ' backup=' + result.backup);
                buildBrowseItems();
                await renderTagEditor();
            } catch (error) {
                editStatus = 'Ошибка: ' + safeText(error.message || error, 100);
                log.error('ID3 write failed: ' + (error.stack || error));
                await renderTagEditor();
            }
        }
        function handleEditorTap(x, y) {
            if (!editTrack || typeof x !== 'number' || typeof y !== 'number') return;
            if (y >= 90 && y < 270) {
                const idx = Math.floor((y - 92) / 29);
                if (idx >= 0 && idx < tagFieldDefs.length) editField = idx;
            } else if (y >= 315 && y < 470) {
                const ri = Math.floor((y - 315) / 47);
                const row = keyboardLayouts[editLayout][ri];
                if (row) {
                    const keyW = 78, gap = 8;
                    const total = row.length * keyW + (row.length - 1) * gap;
                    const startX = (W - total) / 2;
                    const ci = Math.floor((x - startX) / (keyW + gap));
                    if (ci >= 0 && ci < row.length && x <= startX + ci * (keyW + gap) + keyW) {
                        if (editFields[editField].length < 100) editFields[editField] += row.charAt(ci);
                    }
                }
            } else if (y >= 465) {
                if (x >= 470 && x < 620) editFields[editField] += ' ';
                else if (x >= 620 && x < 760) editFields[editField] = editFields[editField].slice(0, -1);
                else if (x >= 760 && x < 900) editFields[editField] = '';
                else if (x >= 900) editLayout = editLayout === 'RU' ? 'EN' : 'RU';
            }
            renderTagEditor();
        }
        async function renderTrash() {
            const cv = ctx.canvas(W, H).clear(BG);
            cv.roundRect(18, 12, W - 36, H - 24, 16, PANEL);
            cv.text('КОРЗИНА USB', 48, 52, 25, BLUE, {font:'label', literal:true});
            cv.text(trashStatus, 48, 84, 17, MUTED, {font:'label', literal:true});
            const start = Math.max(0, Math.min(Math.max(0, trashItems.length - PAGE_ROWS), trashSelected - Math.floor(PAGE_ROWS / 2)));
            for (let i = start; i < Math.min(trashItems.length, start + PAGE_ROWS); i++) {
                const item = trashItems[i];
                const y = 145 + (i - start) * 47;
                cv.roundRect(38, y - 25, 1480, 40, 7, i === trashSelected ? '#17496a' : '#172431');
                cv.text(String(i + 1).padStart(3, '0'), 55, y, 15, i === trashSelected ? BLUE : MUTED, {font:'label', literal:true});
                cv.text(safeText(item.title || item.id, 75), 120, y, 19, TEXT, {font:'label', literal:true});
                cv.text(safeText(item.originalPath || '', 95), 760, y, 14, MUTED, {font:'label', literal:true});
            }
            if (!trashItems.length) cv.text('Корзина пуста', 60, 210, 22, MUTED, {font:'label', literal:true});
            cv.text('Удаление перемещает MP3 в .umm_trash на этой USB. Restore возвращает файл обратно.', 60, 475, 15, MUTED, {font:'label', literal:true});
            await ui.image('TRASH_GFX', cv);
        }

        async function moveSelectedToTrash() {
            if (busy || viewMode !== 0) { status = 'Удалять в корзину можно из списка треков'; await render(); return; }
            const list = currentTracks();
            const track = list[selected];
            if (!track) return;
            const mount = track.mount || (volumes[0] && volumes[0].volume && volumes[0].volume.mount);
            if (!mount) { status = 'Не удалось определить USB-накопитель'; await render(); return; }
            try {
                filemanager.moveToTrash(track.path, mount, track.title || track.name);
                tracks = tracks.filter(function(t) { return t.path !== track.path; });
                activeFilter = null;
                selected = Math.max(0, Math.min(selected, tracks.length - 1));
                buildBrowseItems();
                status = 'Файл перемещён в корзину USB';
                log.info('Moved MP3 to USB trash: ' + track.path);
            } catch (error) {
                status = 'Ошибка корзины: ' + safeText(error.message || error, 90);
                log.error('USB trash move failed: ' + (error.stack || error));
            }
            await render();
        }

        async function restoreSelectedFromTrash() {
            const item = trashItems[trashSelected];
            if (!item) return;
            try {
                filemanager.restoreFromTrash(item, trashMount);
                trashStatus = 'Файл восстановлен. Выполните Scan USB для обновления списка.';
                await loadTrash(trashMount);
            } catch (error) {
                trashStatus = 'Ошибка восстановления: ' + safeText(error.message || error, 90);
            }
            await renderTrash();
        }

        async function renderNowPlaying() {
            const cv = ctx.canvas(W, H).clear(BG);
            cv.roundRect(18, 12, W - 36, H - 24, 16, PANEL);
            cv.text('СЕЙЧАС ИГРАЕТ', 48, 52, 25, BLUE, {font:'label', literal:true});
            cv.text('Проверка штатного медиаплеера MGU', 48, 83, 17, MUTED, {font:'label', literal:true});
            if (nowBusy) {
                cv.text('Запрашиваю список аудиоисточников…', 60, 160, 22, YELLOW, {font:'label', literal:true});
            } else if (nowError) {
                cv.text('Не удалось получить данные AudioManager', 60, 155, 21, YELLOW, {font:'label', literal:true});
                cv.text(nowError, 60, 194, 16, MUTED, {font:'label', literal:true});
            } else if (!nowSnapshot) {
                cv.text('Нажмите «Обновить» для проверки источника воспроизведения', 60, 160, 20, MUTED, {font:'label', literal:true});
            } else {
                const sources = nowSnapshot.sources || [];
                const sinks = nowSnapshot.sinks || [];
                const connections = nowSnapshot.connections || [];
                function byId(items, id, field) {
                    for (let i = 0; i < items.length; i++) {
                        if (String(items[i][field]) === String(id)) return items[i];
                    }
                    return null;
                }
                cv.text('Активные аудиосоединения: ' + connections.length, 60, 135, 19, TEXT, {font:'label', literal:true});
                let y = 180;
                connections.slice(0, 5).forEach(function(connection, index) {
                    const source = byId(sources, connection.sourceID, 'sourceID');
                    const sink = byId(sinks, connection.sinkID, 'sinkID');
                    const sourceName = source && source.name ? source.name : ('source ' + connection.sourceID);
                    const sinkName = sink && sink.name ? sink.name : ('sink ' + connection.sinkID);
                    cv.text(safeText(sourceName + '  →  ' + sinkName, 90), 65, y, 19, GREEN, {font:'label', literal:true});
                    cv.text('Состояние: ' + safeText(connection.connectionState || 'неизвестно', 28), 65, y + 25, 14, MUTED, {font:'label', literal:true});
                    y += 62;
                });
                if (!connections.length) cv.text('Сейчас нет зарегистрированных аудиосоединений', 65, 180, 19, MUTED, {font:'label', literal:true});
                const usbActive = connections.some(function(connection) {
                    const source = byId(sources, connection.sourceID, 'sourceID');
                    return source && /usb/i.test(String(source.name || ''));
                });
                cv.text(usbActive ? 'Обнаружен подключённый источник с названием USB' : 'Источник USB пока не удалось подтвердить', 60, 440, 18, usbActive ? GREEN : YELLOW, {font:'label', literal:true});
                cv.text('Источников: ' + sources.length + '   Выходов: ' + sinks.length + '   Проверено: ' + nowSnapshot.checkedAt, 60, 475, 14, MUTED, {font:'label', literal:true});
            }
            cv.text('Название и исполнитель появятся после обнаружения интерфейса метаданных плеера', 60, 405, 16, MUTED, {font:'label', literal:true});
            await ui.image('NOW_GFX', cv);
        }

        async function render() {
            const cv = ctx.canvas(W, H).clear(BG);
            cv.roundRect(18, 12, W - 36, H - 24, 16, PANEL);
            cv.text('USB MUSIC MANAGER', 48, 52, 25, BLUE, {font:'label', literal:true});
            cv.text(status, 48, 83, 17, busy ? YELLOW : (tracks.length ? GREEN : MUTED), {font:'label', literal:true});
            cv.text('USB: ' + volumes.length + '   MP3: ' + tracks.length, W - 48, 52, 19, TEXT, {font:'label', literal:true, align:'right'});
            if (scannedAt) cv.text('Scan: ' + scannedAt, W - 48, 82, 14, MUTED, {font:'label', literal:true});

            const isTracks = viewMode === 0;
            const list = isTracks ? currentTracks() : browseItems;
            const start = Math.max(0, Math.min(Math.max(0, list.length - PAGE_ROWS), selected - Math.floor(PAGE_ROWS / 2)));
            const end = Math.min(list.length, start + PAGE_ROWS);
            const heading = isTracks ? 'TRACKS' : viewModes[viewMode].toUpperCase();
            cv.text(heading + (activeFilter ? ' · ' + safeText(activeFilter.value, 42) : '') +
                (isTracks ? ' · SORT: ' + sortModes[sortMode].label.toUpperCase() : ''), 48, 125, 15, MUTED, {font:'label', literal:true});
            for (let i = start; i < end; i++) {
                const item = list[i];
                const y = 145 + (i - start) * 47;
                const active = i === selected;
                cv.roundRect(38, y - 25, details && isTracks ? 900 : 1480, 40, 7, active ? '#17496a' : '#172431');
                cv.text(String(i + 1).padStart(4, '0'), 55, y, 15, active ? BLUE : MUTED, {font:'label', literal:true});
                if (isTracks) {
                    const t = item;
                    cv.text(safeText(t.title || t.name, 66), 120, y, 19, active ? TEXT : '#c6d2de', {font:'label', literal:true});
                    cv.text(safeText(t.artist || 'Unknown artist', 35), 820, y, 15, MUTED, {font:'label', literal:true});
                    cv.text(safeText(t.album || '', 32), 1120, y, 15, MUTED, {font:'label', literal:true});
                } else {
                    cv.text(safeText(item.label, 78), 120, y, 19, active ? TEXT : '#c6d2de', {font:'label', literal:true});
                    cv.text('Треков: ' + item.count, 820, y, 15, MUTED, {font:'label', literal:true});
                }
                cv.text((i + 1) + '/' + list.length, 1500, y, 14, MUTED, {font:'label', literal:true, align:'right'});
            }

            if (!list.length && !busy) {
                cv.text(tracks.length ? 'В этом разделе пока нет записей' : 'Нажмите Scan USB для поиска музыкальных файлов', 60, 220, 22, MUTED, {font:'label', literal:true});
                cv.text('Поддерживаются MP3. Файлы на USB не изменяются.', 60, 260, 17, MUTED, {font:'label', literal:true});
            }

            if (details && isTracks && list[selected]) {
                const t = list[selected];
                cv.roundRect(970, 116, 580, 350, 12, '#0c141d');
                cv.text('TRACK DETAILS', 995, 150, 16, BLUE, {font:'label', literal:true});
                cv.text(safeText(t.title || t.name, 45), 995, 190, 20, TEXT, {font:'label', literal:true});
                cv.text('Artist: ' + safeText(t.artist || '—', 45), 995, 232, 16, MUTED, {font:'label', literal:true});
                cv.text('Album: ' + safeText(t.album || '—', 45), 995, 266, 16, MUTED, {font:'label', literal:true});
                cv.text('Track: ' + safeText(t.track || '—', 15) + '   Year: ' + safeText(t.year || '—', 10), 995, 300, 16, MUTED, {font:'label', literal:true});
                cv.text('Genre: ' + safeText(t.genre || '—', 35), 995, 334, 16, MUTED, {font:'label', literal:true});
                cv.text('Обложка: ' + (t.hasCover ? 'встроена' : 'нет'), 995, 368, 16, MUTED, {font:'label', literal:true});
                cv.text('Size: ' + (Math.round((t.size || 0) / 1024 / 1024 * 10) / 10) + ' MB', 995, 402, 16, MUTED, {font:'label', literal:true});
                cv.text(safeText(t.path || '', 68), 995, 438, 13, MUTED, {font:'label', literal:true});
            }

            cv.text('MP3 ONLY  ·  ID3 EDITOR CREATES BACKUP  ·  USB TRASH', 48, 490, 13, MUTED, {font:'label', literal:true});
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
                sortTracks();
                viewMode = 0;
                activeFilter = null;
                selected = 0;
                buildBrowseItems();
                scannedAt = new Date().toLocaleTimeString();
                const truncated = volumes.some(function(v) { return v.truncated; });
                status = truncated
                    ? 'Сканирование завершено: достигнут лимит, найдено MP3: ' + tracks.length
                    : (tracks.length ? 'Сканирование завершено' : 'USB найден, MP3 не обнаружены · просмотрено: ' + volumes.reduce(function(n, v) { return n + (v.entries || 0); }, 0) + ' · ошибок: ' + volumes.reduce(function(n, v) { return n + (v.skipped || 0); }, 0));
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
        ui.onClick('BTN_NOW', function() { ui.open('NOW').then(refreshNowPlaying); });
        ui.onClick('BTN_DELETE', moveSelectedToTrash);
        ui.onClick('BTN_EDIT', openTagEditor);
        ui.onClick('BTN_EDIT_SAVE', saveTagEditor);
        ui.onClick('BTN_EDIT_BACK', function() { ui.open('MAIN'); });
        ctx.onTap(function(x, y) { if (ui.isVisible('EDIT')) handleEditorTap(x, y); });
        ui.onClick('BTN_TRASH', function() {
            const mount = volumes[0] && volumes[0].volume && volumes[0].volume.mount;
            ui.open('TRASH').then(function() { return loadTrash(mount); }).then(renderTrash);
        });
        ui.onClick('BTN_TRASH_PREV', function() { if (trashItems.length) trashSelected = (trashSelected - 1 + trashItems.length) % trashItems.length; renderTrash(); });
        ui.onClick('BTN_TRASH_NEXT', function() { if (trashItems.length) trashSelected = (trashSelected + 1) % trashItems.length; renderTrash(); });
        ui.onClick('BTN_RESTORE', restoreSelectedFromTrash);
        ui.onClick('BTN_TRASH_BACK', function() { ui.open('MAIN'); });
        ui.onClick('BTN_NOW_REFRESH', refreshNowPlaying);
        ui.onClick('BTN_NOW_BACK', function() { ui.open('MAIN'); });
        ui.onClick('BTN_PREV', function() {
            const count = viewMode === 0 ? currentTracks().length : browseItems.length;
            if (count) selected = (selected - 1 + count) % count;
            render();
        });
        ui.onClick('BTN_NEXT', function() {
            const count = viewMode === 0 ? currentTracks().length : browseItems.length;
            if (count) selected = (selected + 1) % count;
            render();
        });
        ui.onClick('BTN_VIEW', function() {
            viewMode = (viewMode + 1) % viewModes.length;
            activeFilter = null;
            details = false;
            selected = 0;
            buildBrowseItems();
            render();
        });
        ui.onClick('BTN_OPEN', function() {
            if (viewMode === 0 || !browseItems[selected]) return;
            const item = browseItems[selected];
            activeFilter = {type:viewModes[viewMode], value:item.label};
            viewMode = 0;
            selected = 0;
            details = false;
            render();
        });
        ui.onClick('BTN_SORT', function() {
            sortMode = (sortMode + 1) % sortModes.length;
            sortTracks();
            selected = 0;
            buildBrowseItems();
            render();
        });
        ui.onClick('BTN_INFO', function() {
            details = !details;
            render();
        });
        ui.onVisible(function(name, visible) {
            if (name === 'MAIN' && visible) render();
            if (name === 'NOW' && visible) renderNowPlaying();
            if (name === 'TRASH' && visible) renderTrash();
            if (name === 'EDIT' && visible) renderTagEditor();
        });

        // Do not perform a synchronous recursive USB scan during process startup:
        // on large drives this can block OAP before the first frame is displayed.
        await render();
        log.info('USB Music Manager 0.1.14 started; waiting for user scan request');
    }
});
