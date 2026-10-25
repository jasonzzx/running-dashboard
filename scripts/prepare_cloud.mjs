import fs from 'node:fs';
fs.mkdirSync('public',{recursive:true});
fs.cpSync('dashboard','public',{recursive:true,filter:source=>!['dashboard/index.html','dashboard/admin.html'].includes(source)});
