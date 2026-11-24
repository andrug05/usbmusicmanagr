'use strict';
var fs = require('fs'), path = require('path'), id3 = require('./id3');
var AUDIO_EXT = {'.mp3':true};
function unescapeMount(s) { return s.replace(/\\040/g,' ').replace(/\\011/g,'\t').replace(/\\012/g,'\n').replace(/\\134/g,'\\'); }
function readMounts(file) {
  var rows = fs.readFileSync(file || '/proc/mounts','utf8').split(/\r?\n/), out = [];
  rows.forEach(function(line) {
    var p = line.split(' '); if (p.length < 4) return;
    var mount = unescapeMount(p[1]);
    if (mount.indexOf('/media/') !== 0 && mount.indexOf('/run/media/') !== 0) return;
    out.push({device:p[0],mount:mount,fs:p[2],readOnly:p[3].split(',').indexOf('ro') !== -1});
  });
  return out;
}
function inside(root,candidate) { var rel=path.relative(root,candidate); return rel==='' || (rel!=='..' && rel.indexOf('..'+path.sep)!==0 && !path.isAbsolute(rel)); }
function readTags(file,stat) {
  var fd,buf;
  try { fd=fs.openSync(file,'r'); var len=Math.min(stat.size,1024*1024); buf=new Buffer(len); fs.readSync(fd,buf,0,len,0); }
  catch(e) { return {title:path.basename(file,path.extname(file)),artist:'',album:'',track:'',year:'',genre:''}; }
  finally { if(fd!==undefined) try { fs.closeSync(fd); } catch(ignore) {} }
  var tags=id3.parseID3(buf); if(!tags.title) tags.title=path.basename(file,path.extname(file)); return tags;
}
function scanVolume(volume,options) {
  options=options||{}; var root=path.resolve(volume.mount), results=[], count=0, max=options.maxFiles||20000;
  function walk(dir,depth) {
    if(depth>20 || count>=max) return;
    var entries; try { entries=fs.readdirSync(dir); } catch(e) { return; }
    entries.forEach(function(name) {
      if(count>=max || name.charAt(0)==='.') return;
      var full=path.join(dir,name), st; if(!inside(root,full)) return;
      try { st=fs.statSync(full); } catch(e) { return; }
      if(st.isDirectory()) { walk(full,depth+1); return; }
      if(!st.isFile() || !AUDIO_EXT[path.extname(name).toLowerCase()]) return;
      count++; var t=readTags(full,st);
      results.push({path:full,name:name,size:st.size,modified:st.mtime.toISOString(),title:t.title,artist:t.artist,album:t.album,track:t.track,year:t.year,genre:t.genre,coverMime:t.coverMime,cover:t.cover});
    });
  }
  walk(root,0); return {volume:volume,count:results.length,truncated:count>=max,tracks:results};
}
function scanAll(options) { var v=readMounts(); return {scannedAt:new Date().toISOString(),volumes:v.map(function(x){return scanVolume(x,options);})}; }
module.exports={readMounts:readMounts,scanVolume:scanVolume,scanAll:scanAll};
