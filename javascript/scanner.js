'use strict';

var fs = require('fs');
var path = require('path');
var id3 = require('./id3');

var MP3_EXT = '.mp3';
var DEFAULT_MAX_FILES = 20000;
var DEFAULT_MAX_DEPTH = 24;
var MAX_TAG_BYTES = 1024 * 1024;

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
    var fsType = fields[2];
    var options = fields[3].split(',');

    // Only inspect removable-media mount locations. No arbitrary filesystem walk.
    if (mount.indexOf('/media/') !== 0 && mount.indexOf('/run/media/') !== 0) return;
    if (device.indexOf('/dev/') !== 0) return;

    volumes.push({
      device: device,
      mount: mount,
      fs: fsType,
      readOnly: options.indexOf('ro') !== -1
    });
  });

  return volumes;
}

function readTags(file, stat) {
  var fd;
  var buffer;

  try {
    fd = fs.openSync(file, 'r');
    var length = Math.min(stat.size, MAX_TAG_BYTES);
    buffer = Buffer.alloc(length);
    if (length > 0) fs.readSync(fd, buffer, 0, length, 0);
  } catch (error) {
    return {
      title: path.basename(file, path.extname(file)),
      artist: '',
      album: '',
      track: '',
      year: '',
      genre: '',
      coverMime: '',
      cover: null
    };
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (ignore) {}
    }
  }

  var tags = id3.parseID3(buffer);
  if (!tags.title) tags.title = path.basename(file, path.extname(file));
  return tags;
}

function isInside(root, candidate) {
  var relative = path.relative(root, candidate);
  return relative === '' ||
    (relative !== '..' &&
     relative.indexOf('..' + path.sep) !== 0 &&
     !path.isAbsolute(relative));
}

function scanVolume(volume, options) {
  options = options || {};

  var root = path.resolve(volume.mount);
  var tracks = [];
  var visitedMp3 = 0;
  var maxFiles = options.maxFiles || DEFAULT_MAX_FILES;
  var maxDepth = options.maxDepth || DEFAULT_MAX_DEPTH;

  function walk(directory, depth) {
    if (depth > maxDepth || visitedMp3 >= maxFiles) return;

    var names;
    try {
      names = fs.readdirSync(directory);
    } catch (error) {
      return;
    }

    names.forEach(function(name) {
      if (visitedMp3 >= maxFiles || !name || name.charAt(0) === '.') return;

      var fullPath = path.join(directory, name);
      if (!isInside(root, fullPath)) return;

      var stat;
      try {
        // lstat deliberately avoids following symlinks outside the USB volume.
        stat = fs.lstatSync(fullPath);
      } catch (error) {
        return;
      }

      if (stat.isSymbolicLink()) return;
      if (stat.isDirectory()) {
        walk(fullPath, depth + 1);
        return;
      }

      if (!stat.isFile() || path.extname(name).toLowerCase() !== MP3_EXT) return;

      visitedMp3++;
      var tags = readTags(fullPath, stat);

      tracks.push({
        path: fullPath,
        name: name,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        title: tags.title || path.basename(name, path.extname(name)),
        artist: tags.artist || '',
        album: tags.album || '',
        track: tags.track || '',
        year: tags.year || '',
        genre: tags.genre || '',
        coverMime: tags.coverMime || '',
        cover: tags.cover || null
      });
    });
  }

  walk(root, 0);

  return {
    volume: volume,
    count: tracks.length,
    truncated: visitedMp3 >= maxFiles,
    tracks: tracks
  };
}

function scanAll(options) {
  var volumes = readMounts();
  return {
    scannedAt: new Date().toISOString(),
    volumes: volumes.map(function(volume) {
      return scanVolume(volume, options);
    })
  };
}

module.exports = {
  readMounts: readMounts,
  scanVolume: scanVolume,
  scanAll: scanAll
};
