'use strict';

var fs = require('fs');
var path = require('path');
var id3 = require('./id3');

var MP3_EXT = '.mp3';
var DEFAULT_MAX_FILES = 5000;
var DEFAULT_MAX_DEPTH = 16;
var DEFAULT_MAX_ENTRIES = 50000;
var MAX_TAG_BYTES = 256 * 1024;

function unescapeMount(value) {
  return value.replace(/\\([0-7]{3})/g, function(_, octal) {
    return String.fromCharCode(parseInt(octal, 8));
  });
}

function readMounts(mountsFile) {
  var content = fs.readFileSync(mountsFile || '/proc/mounts', 'utf8');
  var rows = content.split(/\r?\n/);
  var volumes = [];
  rows.forEach(function(line) {
    if (!line) return;
    var fields = line.trim().split(/\s+/);
    if (fields.length < 4) return;
    var device = unescapeMount(fields[0]);
    var mount = unescapeMount(fields[1]);
    var options = fields[3].split(',');
    if ((mount.indexOf('/media/') !== 0 && mount.indexOf('/run/media/') !== 0) || device.indexOf('/dev/') !== 0) return;
    volumes.push({device:device, mount:mount, fs:fields[2], readOnly:options.indexOf('ro') !== -1});
  });
  return volumes;
}

function asyncCall(method, args) {
  return new Promise(function(resolve, reject) {
    method.apply(fs, args.concat(function(error, value) {
      if (error) reject(error);
      else resolve(value);
    }));
  });
}

function readTagsAsync(file, stat) {
  return asyncCall(fs.open, [file, 'r']).then(function(fd) {
    var length = Math.min(stat.size, MAX_TAG_BYTES);
    var buffer = Buffer.alloc(length);
    return asyncCall(fs.read, [fd, buffer, 0, length, 0]).then(function() {
      return id3.parseID3(buffer);
    }).catch(function() {
      return {};
    }).then(function(tags) {
      return asyncCall(fs.close, [fd]).catch(function() {}).then(function() {
        if (!tags.title) tags.title = path.basename(file, path.extname(file));
        return tags;
      });
    });
  }).catch(function() {
    return {title:path.basename(file, path.extname(file)), artist:'', album:'', track:'', year:'', genre:''};
  });
}

function isInside(root, candidate) {
  var relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && relative.indexOf('..' + path.sep) !== 0 && !path.isAbsolute(relative));
}

// Asynchronous breadth-first scan: filesystem operations never block the HMI thread.
function scanVolumeAsync(volume, options) {
  options = options || {};
  var root = path.resolve(volume.mount);
  var maxFiles = options.maxFiles || DEFAULT_MAX_FILES;
  var maxDepth = options.maxDepth || DEFAULT_MAX_DEPTH;
  var maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;
  var tracks = [];
  var queue = [{directory:root, depth:0}];
  var visitedEntries = 0;
  var skipped = 0;

  function notify() {
    if (typeof options.onProgress === 'function') {
      try { options.onProgress({mount:volume.mount, files:tracks.length, entries:visitedEntries, skipped:skipped}); } catch (ignore) {}
    }
  }

  function nextDirectory() {
    if (!queue.length || tracks.length >= maxFiles || visitedEntries >= maxEntries) {
      return Promise.resolve({volume:volume, count:tracks.length, truncated:queue.length > 0 || tracks.length >= maxFiles || visitedEntries >= maxEntries, entries:visitedEntries, skipped:skipped, tracks:tracks});
    }
    var item = queue.shift();
    return asyncCall(fs.readdir, [item.directory]).then(function(names) {
      var chain = Promise.resolve();
      names.forEach(function(name) {
        chain = chain.then(function() {
          if (!name || name.charAt(0) === '.' || tracks.length >= maxFiles || visitedEntries >= maxEntries) return;
          visitedEntries++;
          var fullPath = path.join(item.directory, name);
          if (!isInside(root, fullPath)) return;
          return asyncCall(fs.lstat, [fullPath]).then(function(stat) {
            if (stat.isSymbolicLink()) return;
            if (stat.isDirectory()) {
              if (item.depth < maxDepth) queue.push({directory:fullPath, depth:item.depth + 1});
              else skipped++;
              return;
            }
            if (!stat.isFile() || path.extname(name).toLowerCase() !== MP3_EXT) return;
            return readTagsAsync(fullPath, stat).then(function(tags) {
              tracks.push({
                path:fullPath, name:name, size:stat.size,
                modified:stat.mtime && stat.mtime.toISOString ? stat.mtime.toISOString() : '',
                title:tags.title || path.basename(name, path.extname(name)),
                artist:tags.artist || '', album:tags.album || '',
                track:tags.track || '', year:tags.year || '', genre:tags.genre || '',
                coverMime:tags.coverMime || '', hasCover:!!tags.hasCover
              });
              if (tracks.length % 25 === 0) notify();
            });
          }).catch(function() { skipped++; });
        });
      });
      return chain.then(function() { notify(); return nextDirectory(); });
    }).catch(function() { skipped++; return nextDirectory(); });
  }

  return nextDirectory();
}

function scanAllAsync(options) {
  options = options || {};
  var volumes;
  try { volumes = readMounts(); }
  catch (error) { return Promise.reject(error); }
  var results = [];
  var chain = Promise.resolve();
  volumes.forEach(function(volume) {
    chain = chain.then(function() {
      return scanVolumeAsync(volume, options).then(function(result) { results.push(result); });
    });
  });
  return chain.then(function() {
    return {scannedAt:new Date().toISOString(), volumes:results};
  });
}

module.exports = {
  readMounts:readMounts,
  scanVolumeAsync:scanVolumeAsync,
  scanAllAsync:scanAllAsync
};
