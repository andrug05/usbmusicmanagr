'use strict';

var fs = require('fs');
var path = require('path');

function inside(root, candidate) {
  var rel = path.relative(root, candidate);
  return rel === '' || (rel !== '..' && rel.indexOf('..' + path.sep) !== 0 && !path.isAbsolute(rel));
}
function syncSafe(n) {
  return Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
}
function frame(id, value) {
  if (!value) return Buffer.alloc(0);
  var body = Buffer.concat([Buffer.from([1, 255, 254]), Buffer.from(String(value), 'utf16le'), Buffer.from([0, 0])]);
  var head = Buffer.alloc(10);
  head.write(id, 0, 4, 'ascii');
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
}
function readExistingArtwork(buffer) {
  var frames = [];
  if (buffer.length < 10 || buffer.toString('ascii', 0, 3) !== 'ID3') return frames;
  var version = buffer[3];
  if (version !== 3 && version !== 4) return frames;
  var pos = 10;
  if (buffer[5] & 0x40) {
    if (pos + 4 > buffer.length) return frames;
    var ext = version === 4 ? (((buffer[pos]&127)<<21)|((buffer[pos+1]&127)<<14)|((buffer[pos+2]&127)<<7)|(buffer[pos+3]&127)) : buffer.readUInt32BE(pos);
    pos += ext + (version === 3 ? 4 : 0);
  }
  var limit = Math.min(buffer.length, 10 + (((buffer[6]&127)<<21)|((buffer[7]&127)<<14)|((buffer[8]&127)<<7)|(buffer[9]&127)));
  while (pos + 10 <= limit) {
    var id = buffer.toString('ascii', pos, pos + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    var size = version === 4
      ? (((buffer[pos+4]&127)<<21)|((buffer[pos+5]&127)<<14)|((buffer[pos+6]&127)<<7)|(buffer[pos+7]&127))
      : buffer.readUInt32BE(pos + 4);
    if (!size || pos + 10 + size > limit) break;
    if (id === 'APIC') {
      var body = buffer.slice(pos + 10, pos + 10 + size);
      var h = Buffer.alloc(10);
      h.write('APIC', 0, 4, 'ascii');
      h.writeUInt32BE(body.length, 4);
      frames.push(Buffer.concat([h, body]));
    }
    pos += 10 + size;
  }
  return frames;
}
function makeTag(tags, artwork) {
  var frames = [
    frame('TIT2', tags.title),
    frame('TPE1', tags.artist),
    frame('TALB', tags.album),
    frame('TRCK', tags.track),
    frame('TYER', tags.year),
    frame('TCON', tags.genre)
  ].concat(artwork || []);
  var body = Buffer.concat(frames);
  var header = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), syncSafe(body.length)]);
  return Buffer.concat([header, body]);
}
function writeTags(file, mount, tags) {
  var root = path.resolve(mount);
  var target = path.resolve(file);
  if (!inside(root, target) || target === root) throw new Error('MP3 is outside selected USB');
  var st = fs.lstatSync(target);
  if (!st.isFile() || st.isSymbolicLink() || path.extname(target).toLowerCase() !== '.mp3') throw new Error('Only regular MP3 files can be edited');
  if (st.size < 1 || st.size > 256 * 1024 * 1024) throw new Error('MP3 size is outside supported limits');
  var original = fs.readFileSync(target);
  var offset = 0;
  if (original.length >= 10 && original.toString('ascii', 0, 3) === 'ID3') {
    var tagSize = (((original[6]&127)<<21)|((original[7]&127)<<14)|((original[8]&127)<<7)|(original[9]&127));
    offset = Math.min(original.length, 10 + tagSize + ((original[5] & 0x10) ? 10 : 0));
  }
  var end = original.length;
  if (end >= 128 && original.toString('ascii', end - 128, end - 125) === 'TAG') end -= 128;
  if (offset >= end) throw new Error('No audio data found in MP3');
  var artwork = readExistingArtwork(original);
  var tag = makeTag(tags, artwork);
  var output = Buffer.concat([tag, original.slice(offset, end)]);
  var backupDir = path.join(root, '.umm_tag_backup');
  if (!inside(root, backupDir)) throw new Error('Invalid backup directory');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { mode: 0o700 });
  var bst = fs.lstatSync(backupDir);
  if (!bst.isDirectory() || bst.isSymbolicLink()) throw new Error('Unsafe backup directory');
  var stamp = Date.now().toString(36);
  var backup = path.join(backupDir, stamp + '_' + path.basename(target));
  fs.copyFileSync(target, backup, fs.constants && fs.constants.COPYFILE_EXCL ? fs.constants.COPYFILE_EXCL : 1);
  var temp = target + '.umm_tmp_' + stamp;
  try {
    fs.writeFileSync(temp, output, { flag: 'wx', mode: st.mode & 0o777 });
    fs.renameSync(temp, target);
  } catch (error) {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch (ignore) {}
    throw error;
  }
  return {backup:backup, size:output.length};
}
module.exports = {writeTags:writeTags};
