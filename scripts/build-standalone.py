"""Embed the module graph once, creating short module Blob URLs at page load."""
import base64, json, pathlib, re
root=pathlib.Path(__file__).resolve().parent.parent
src=root/'dist'
sources={p.name:p.read_text() for p in sorted(src.glob('*.js'))}
# JSON modules are shipped separately for the editable app and embedded offline here.
sources.update({p.name:p.read_text() for p in sorted(src.glob('*.json'))})
# Escape HTML script endings while preserving source strings exactly after JSON parsing.
payload=json.dumps(sources,ensure_ascii=True).replace('</','<\\/')
bootstrap='''const moduleSources=PAYLOAD;
const moduleURLs=new Map();
function moduleURL(name){
 name=name.split('?')[0];
 if(moduleURLs.has(name))return moduleURLs.get(name);
 let source=moduleSources[name];
 if(source===undefined)throw new Error('Missing embedded module: '+name);
 source=source.replace(/from (['"])\\.\\/([^'"]+)\\1/g,(_,quote,dep)=>'from '+quote+moduleURL(dep)+quote);
 if(name==='app.js')source=source.replaceAll("new Worker('map-worker.js?v=4.4',{type:'module'})","new Worker('"+moduleURL('map-worker.js')+"',{type:'module'})");
 const url=URL.createObjectURL(new Blob([source],{type:name.endsWith('.json')?'application/json':'text/javascript'}));
 moduleURLs.set(name,url);return url;
}
await import(moduleURL('app.js'));
'''.replace('PAYLOAD',payload)
html=(src/'index.html').read_text()
html=re.sub(r'<link rel="stylesheet" href="style\.css(?:\?[^"]*)?">',lambda _: '<style>'+(src/'style.css').read_text()+'</style>',html)
html=re.sub(r'<script type="module" src="app\.js(?:\?[^"]*)?"></script>',lambda _: '<script type="module">'+bootstrap+'</script>',html)
icon='data:image/svg+xml;base64,'+base64.b64encode((src/'icon.svg').read_bytes()).decode()
html=html.replace('href="icon.svg"','href="'+icon+'"')
output=root/'roadster-flight-lab.html';output.write_text(html)
print(f'{output} ({output.stat().st_size:,} bytes; {len(sources)} module/data assets embedded once)')
