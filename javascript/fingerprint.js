'use strict';

var child = require('child_process');
var https = require('https');
var querystring = require('querystring');

var CLIENT_KEY = 'FW1zGtkoNj';
var FPCALC_PATHS = ['/usr/bin/fpcalc', '/usr/local/bin/fpcalc', '/opt/bin/fpcalc', 'fpcalc'];

function runFpcalc(file) {
  return new Promise(function(resolve, reject) {
    var index = 0;
    function attempt(lastError) {
      if (index >= FPCALC_PATHS.length) {
        reject(new Error('fpcalc не найден. Установите готовый fpcalc в /usr/bin или /usr/local/bin. ' + (lastError && lastError.message ? lastError.message : '')));
        return;
      }
      var executable = FPCALC_PATHS[index++];
      child.execFile(executable, ['-json', file], {timeout: 120000, maxBuffer: 1024 * 1024}, function(error, stdout, stderr) {
        if (error) {
          if (error.code === 'ENOENT') { attempt(error); return; }
          reject(new Error('fpcalc: ' + String(stderr || error.message || error).slice(0, 240)));
          return;
        }
        try {
          var data = JSON.parse(stdout);
          if (!data || !data.fingerprint || !data.duration) throw new Error('fpcalc вернул пустой отпечаток');
          resolve({fingerprint:data.fingerprint, duration:Math.round(Number(data.duration))});
        } catch (parseError) { reject(parseError); }
      });
    }
    attempt();
  });
}

function requestJson(url, timeout) {
  return new Promise(function(resolve, reject) {
    var req = https.get(url, {headers:{'User-Agent':'USB-Music-Manager/0.1.15 (BMW MGU)'}}, function(res) {
      var chunks = [];
      var total = 0;
      res.on('data', function(chunk) {
        total += chunk.length;
        if (total > 2 * 1024 * 1024) { req.abort(); reject(new Error('Ответ сервиса слишком большой')); return; }
        chunks.push(chunk);
      });
      res.on('end', function() {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error('AcoustID HTTP ' + res.statusCode));
          return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error('Некорректный ответ AcoustID')); }
      });
    });
    req.setTimeout(timeout || 15000, function() { req.abort(); reject(new Error('Тайм-аут соединения с AcoustID')); });
    req.on('error', reject);
  });
}

function chooseRecording(data) {
  var results = data && data.results || [];
  var best = null;
  results.forEach(function(result) {
    (result.recordings || []).forEach(function(recording) {
      var group = (recording.releasegroups || [])[0] || {};
      var artists = recording.artists || [];
      var candidate = {
        score:Number(result.score || 0),
        title:recording.title || '',
        artist:artists.map(function(a) { return a.name || ''; }).filter(Boolean).join(', '),
        album:group.title || '',
        year:(recording['first-release-date'] || group['first-release-date'] || '').slice(0, 4),
        track:'',
        genre:'',
        recordingId:recording.id || '',
        releaseGroupId:group.id || ''
      };
      if (!best || candidate.score > best.score) best = candidate;
    });
  });
  return best;
}

function identify(file) {
  return runFpcalc(file).then(function(fp) {
    var params = querystring.stringify({
      client:CLIENT_KEY,
      duration:fp.duration,
      fingerprint:fp.fingerprint,
      meta:'recordings+releasegroups'
    });
    return requestJson('https://api.acoustid.org/v2/lookup?' + params, 20000);
  }).then(function(data) {
    if (!data || data.status !== 'ok') throw new Error(data && data.error ? data.error : 'AcoustID не подтвердил запрос');
    var candidate = chooseRecording(data);
    if (!candidate) throw new Error('Совпадений не найдено в AcoustID / MusicBrainz');
    return candidate;
  });
}

module.exports = {identify:identify};
