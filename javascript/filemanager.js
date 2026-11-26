'use strict';

var fs = require('fs');
var path = require('path');

var TRASH_NAME = '.umm_trash';

function inside(root, candidate) {
  var rel = path.relative(root, candidate);
  return rel === '' || (rel !== '..' && rel.indexOf('..' + path.sep) !== 0 && !path.isAbsolute(rel));
}

function resolveVolume(mount) {
  var root = path.resolve(mount);
  var st = fs.statSync(root);
  if (!st.isDirectory()) throw new Error('USB mount is not a directory');
  return root;
}

function ensureTrash(root) {
  var dir = path.join(root, TRASH_NAME);
  if (!inside(root, dir)) throw new Error('Invalid trash path');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700 });
  var st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Trash path is not a safe directory');
  return dir;
}

function listTrash(mount) {
  var root = resolveVolume(mount);
  var dir = path.join(root, TRASH_NAME);
  if (!fs.existsSync(dir)) return [];
  var st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Unsafe trash directory');
  return fs.readdirSync(dir).filter(function(n) { return /^item_.*\.json$/.test(n); }).map(function(n) {
    try {
      var meta = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
      var stored = path.resolve(dir, meta.storedName || '');
      if (!inside(dir, stored) || !fs.existsSync(stored)) return null;
      return { id: n.slice(0, -5), title: meta.title || meta.originalName || n, originalPath: meta.originalPath, storedPath: stored, mount: root };
    } catch (e) { return null; }
  }).filter(Boolean);
}

function moveToTrash(file, mount, title) {
  var root = resolveVolume(mount);
  var source = path.resolve(file);
  if (!inside(root, source) || source === root) throw new Error('File is outside selected USB');
  var st = fs.lstatSync(source);
  if (!st.isFile() || st.isSymbolicLink() || path.extname(source).toLowerCase() !== '.mp3') throw new Error('Only regular MP3 files can be moved to trash');
  var dir = ensureTrash(root);
  var id = Date.now().toString(36) + '_' + Math.floor(Math.random() * 0xFFFFFF).toString(16);
  var storedName = id + '.mp3';
  var destination = path.join(dir, storedName);
  if (!inside(dir, destination)) throw new Error('Invalid trash destination');
  fs.renameSync(source, destination);
  var meta = {
    version: 1,
    storedName: storedName,
    originalPath: source,
    originalName: path.basename(source),
    title: title || path.basename(source, path.extname(source)),
    deletedAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(path.join(dir, 'item_' + id + '.json'), JSON.stringify(meta, null, 2), { flag: 'wx', mode: 0o600 });
  } catch (e) {
    try { fs.renameSync(destination, source); } catch (rollbackError) {}
    throw e;
  }
  return meta;
}

function restoreFromTrash(item, mount) {
  var root = resolveVolume(mount);
  var dir = path.join(root, TRASH_NAME);
  if (!item || !/^item_[a-z0-9_]+$/.test(item.id || '')) throw new Error('Invalid trash item');
  var metaPath = path.join(dir, item.id + '.json');
  var meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  var stored = path.resolve(dir, meta.storedName || '');
  if (!inside(dir, stored) || !fs.existsSync(stored)) throw new Error('Trashed file is missing');
  var original = path.resolve(meta.originalPath || '');
  if (!inside(root, original) || original === root) throw new Error('Original path is outside USB');
  if (fs.existsSync(original)) throw new Error('Original location already contains a file; nothing was overwritten');
  var parent = path.dirname(original);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw new Error('Original folder no longer exists');
  fs.renameSync(stored, original);
  fs.unlinkSync(metaPath);
  return original;
}

function emptyTrash(mount) {
  var root = resolveVolume(mount);
  var dir = path.join(root, TRASH_NAME);
  if (!fs.existsSync(dir)) return 0;
  var st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Unsafe trash directory');
  var removed = 0;
  fs.readdirSync(dir).forEach(function(name) {
    var target = path.join(dir, name);
    var item = fs.lstatSync(target);
    if (item.isFile() && !item.isSymbolicLink()) {
      fs.unlinkSync(target);
      removed++;
    }
  });
  return removed;
}

module.exports = {
  TRASH_NAME: TRASH_NAME,
  listTrash: listTrash,
  moveToTrash: moveToTrash,
  restoreFromTrash: restoreFromTrash,
  emptyTrash: emptyTrash
};
