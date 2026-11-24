'use strict';
function decodeText(frame) {
  if (!frame || !frame.length) return '';
  var enc = frame[0], data = frame.slice(1), end = frame.length - 1;
  while (end > 0 && (data[end - 1] === 0 || data[end - 1] === 255)) end--;
  data = data.slice(0, end);
  try {
    if (enc === 0) return data.toString('latin1').replace(/\u0000/g, '').trim();
    if (enc === 3) return data.toString('utf8').replace(/\u0000/g, '').trim();
    if (enc === 1 || enc === 2) {
      var little = enc === 1 && data.length >= 2 && data[0] === 255 && data[1] === 254;
      if (enc === 1 && data.length >= 2) data = data.slice(2);
      var out = '';
      for (var i = 0; i + 1 < data.length; i += 2) {
        var code = little ? data[i] | (data[i + 1] << 8) : (data[i] << 8) | data[i + 1];
        out += String.fromCharCode(code);
      }
      return out.trim();
    }
  } catch (e) {}
  return '';
}
function syncSafe(b, o) { return ((b[o] & 127) << 21) | ((b[o+1] & 127) << 14) | ((b[o+2] & 127) << 7) | (b[o+3] & 127); }
function parseID3(buffer) {
  var r = {title:'',artist:'',album:'',track:'',year:'',genre:'',coverMime:'',cover:null};
  var map = {TIT2:'title',TPE1:'artist',TALB:'album',TRCK:'track',TYER:'year',TDRC:'year',TCON:'genre'};
  if (buffer.length >= 10 && buffer.toString('ascii',0,3) === 'ID3') {
    var ver = buffer[3], pos = 10, limit = 10 + Math.min(syncSafe(buffer,6), buffer.length - 10);
    while (pos + 10 <= limit) {
      var id = buffer.toString('ascii',pos,pos+4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      var size = ver === 4 ? syncSafe(buffer,pos+4) : buffer.readUInt32BE(pos+4);
      if (!size || size > limit-pos-10) break;
      var f = buffer.slice(pos+10,pos+10+size);
      if (map[id]) r[map[id]] = decodeText(f);
      if (id === 'APIC' && f.length > 5) {
        var me = f.indexOf(0,1);
        if (me > 1) {
          var p = me + 2, enc = f[0];
          if (enc === 0 || enc === 3) { while (p < f.length && f[p] !== 0) p++; p++; }
          else { while (p+1 < f.length && (f[p] !== 0 || f[p+1] !== 0)) p += 2; p += 2; }
          if (p < f.length) { r.coverMime = f.toString('latin1',1,me); r.cover = f.slice(p).toString('base64'); }
        }
      }
      pos += 10 + size;
    }
  }
  if (buffer.length >= 128 && buffer.toString('ascii',buffer.length-128,buffer.length-125) === 'TAG') {
    var o = buffer.length-125;
    if (!r.title) r.title = buffer.toString('latin1',o,o+30).replace(/\0/g,'').trim();
    if (!r.artist) r.artist = buffer.toString('latin1',o+30,o+60).replace(/\0/g,'').trim();
    if (!r.album) r.album = buffer.toString('latin1',o+60,o+90).replace(/\0/g,'').trim();
    if (!r.year) r.year = buffer.toString('latin1',o+90,o+94).replace(/\0/g,'').trim();
  }
  return r;
}
module.exports = {parseID3:parseID3};
