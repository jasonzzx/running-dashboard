export const presets = ['weekly','race','full'];
// Filter generated tables without interpreting source notes as Markdown instructions.
export function focusedSource(markdown, preset='full') {
 if(!presets.includes(preset))throw new Error('Invalid source preset');
 if(preset==='full')return markdown;
 const sections=markdown.split(/(?=^## )/m);
 const coverage=/Activity coverage \(UTC\): .* to (\d{4}-\d{2}-\d{2})/.exec(markdown)?.[1];
 if(!coverage)return '# Focused export unavailable\n\nThis is a historical report without generated coverage metadata. Select Full history to read it.\n';
 const end=new Date(coverage+'T00:00:00Z'),start=new Date(end);start.setUTCDate(start.getUTCDate()-(preset==='weekly'?27:83));
 const cutoff=start.toISOString().slice(0,10);
 const result=[];
 for(let section of sections){
  if(section.startsWith('## Annual')&&preset==='weekly')continue;
  if(section.startsWith('## Snapshot integrity'))continue;
  if(section.startsWith('## Full activity')||section.startsWith('## Recent wellness')){
   const isActivity=section.startsWith('## Full activity');
   const rows=section.split('\n');
   const selected=rows.filter(line=>{
    if(!line.startsWith('|'))return true;
    const date=/\b(\d{4}-\d{2}-\d{2})(?:T|\b)/.exec(line)?.[1];
    return !date||(date>=cutoff&&(!isActivity||date<=coverage));
   });
   section=selected.join('\n').replace(isActivity?'Full activity history (newest first)':'Recent wellness (latest 90 recorded dates; gaps are not filled)',isActivity?'Selected activity history (newest first)':'Selected wellness (source-local dates; gaps are not filled)');
  }
  result.push(section);
 }
 const purpose=preset==='weekly'?'Weekly review':'Race preparation';
 const question=preset==='weekly'?'Review consistency, recent workload and recovery. Separate observed evidence from suggestions; ask about effort, soreness and availability before proposing next-week changes.':'Review long-run progression, race-specific work and recovery against the reported race goal. Treat race predictions and training paces as provisional; ask about fueling, terrain, conditions and current symptoms.';
 return `# ${purpose} · AI context\n\nExport window: ${cutoff} to ${coverage}, anchored to the latest recorded activity, not today. Activity dates are UTC; wellness dates are source-local. Missing dates do not imply rest or good recovery.\n\nSuggested question: ${question}\n\n`+result.join('');
}
export function exportDocument(current,historical,{preset='full',archive=false}={}) {
 const focused=focusedSource(current,preset);
 return focused+(archive?'\n\n---\n\n# Archived reference — prepared October 26, 2026\n\nThe following report is preserved historical context. Its totals, recovery observations and recommendations have not been refreshed. Use the generated data above for current coverage.\n\n'+historical:'');
}
