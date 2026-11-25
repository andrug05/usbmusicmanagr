'use strict';

// ID3 encoding 0 is formally ISO-8859-1, but many Russian MP3 files
// store Windows-1251 bytes there. Decode the upper half as CP1251 so
// legacy Russian titles remain readable on Node versions without iconv.
var CP1251 = 'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—�™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕїАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя';

function decodeCP1251(data) {
  var out = '';
  for (var i = 0; i < data.length; i++) {
    var b = data[i];
    out += b < 128 ? String.fromCharCode(b) : CP1251.charAt(b - 128);
  }
  return out;
}

function decodeUTF16(data, little) {
  var start = 0;
  if (data.length >= 2) {
    if (data[0] === 255 && data[1] === 254) { little = true; start = 2; }
    else if (data[0] === 254 && data[1] === 255) { little = false; start = 2; }
  }
  var end = data.length;
  while (end - start >= 2 && data[end - 1] === 0 && data[end - 2] === 0) end -= 2;
  var out = '';
  for (var i = start; i + 1 < end; i += 2) {
    var code = little ? data[i] | (data[i + 1] << 8) : (data[i] << 8) | data[i + 1];
    if (code) out += String.fromCharCode(code);
  }
  return out.replace(/\u0000/g, '').trim();
}

function decodeText(frame) {
  if (!frame || !frame.length) return '';
  var enc = frame[0], data = frame.slice(1);
  try {
    if (enc === 0) {
      // Legacy files sometimes store UTF-8 or CP1251 while declaring encoding 0.
      // Accept UTF-8 only if decoding and re-encoding preserves every byte.
      var utf8 = data.toString('utf8');
      if (Buffer.from(utf8, 'utf8').equals(data)) return utf8.replace(/\u0000/g, '').trim();
      return decodeCP1251(data).replace(/\u0000/g, '').trim();
    }
    if (enc === 3) return data.toString('utf8').replace(/\u0000/g, '').trim();
    if (enc === 1) return decodeUTF16(data, true);
    if (enc === 2) return decodeUTF16(data, false);
  } catch (e) {}
  return '';
}
function syncSafe(b, o) { return ((b[o] & 127) << 21) | ((b[o+1] & 127) << 14) | ((b[o+2] & 127) << 7) | (b[o+3] & 127); }
function parseID3(buffer) {
  var r = {title:'',artist:'',album:'',track:'',year:'',genre:'',coverMime:'',hasCover:false};
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
          if (p < f.length) { r.coverMime = f.toString('latin1',1,me); r.hasCover = true; }
        }
      }
      pos += 10 + size;
    }
  }
  if (buffer.length >= 128 && buffer.toString('ascii',buffer.length-128,buffer.length-125) === 'TAG') {
    var o = buffer.length-125;
    if (!r.title) r.title = decodeCP1251(buffer.slice(o,o+30)).replace(/\u0000/g,'').trim();
    if (!r.artist) r.artist = decodeCP1251(buffer.slice(o+30,o+60)).replace(/\u0000/g,'').trim();
    if (!r.album) r.album = decodeCP1251(buffer.slice(o+60,o+90)).replace(/\u0000/g,'').trim();
    if (!r.year) r.year = buffer.toString('latin1',o+90,o+94).replace(/\u0000/g,'').trim();
  }
  return r;
}
module.exports = {parseID3:parseID3};
