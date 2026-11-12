import json, pathlib, statistics, sys
directory=pathlib.Path(__file__).parent
paths=[pathlib.Path(x) for x in sys.argv[1:]] or [p for p in (directory/'results').glob('*.json') if not p.stem.endswith('-analysis')]
def median(values):return round(statistics.median(values),3) if values else None
for p in paths:
    d=json.loads(p.read_text()); rows=[]
    names=list(dict.fromkeys(r['scenario'] for r in d['results'] if 'ms' in r))
    for name in names:
        modes={m:[r for r in d['results'] if r['scenario']==name and r['mode']==m] for m in ['baseline','patched']}
        row={'scenario':name,'modes':{}}
        for mode,rs in modes.items():
            row['modes'][mode]={
                'trials':len(rs),'medianMs':median([r['ms'] for r in rs]),
                'ms':[round(r['ms'],3) for r in rs],
                'medianFirstMs':median([r['firstMs'] for r in rs if 'firstMs' in r]),
                'instances':[r['instances'] for r in rs],
                'cacheTotal':[r['ajvCacheTotal'] for r in rs],
                # Observers in related frames may include overlapping work.
                'maxLongTaskMs':[round(max([t['ms'] for f in r['frames'] for t in f['longTasks']] or [0]),3) for r in rs],
                'kernelObservedLongTaskCounts':[len(r['frames'][0]['longTasks']) for r in rs],
                'allChecksPass':all(not r['failures'] and r.get('objects')==r.get('expectedObjects') for r in rs),
            }
        a=row['modes']['baseline']['medianMs'];b=row['modes']['patched']['medianMs']
        if a and b is not None:row['medianSavingsMs']=round(a-b,3);row['medianSpeedup']=round(a/b,2)
        rows.append(row)
    output={'source':str(p),'browser':d['userAgent'],'rounds':d['rounds'],'completed':d['completed'],'errors':d['errors'],'rows':rows,'compatibility':[r for r in d['results'] if 'outcomes' in r]}
    dest=p.with_name(p.stem+'-analysis.json');dest.write_text(json.dumps(output,indent=2))
    print(p.name,'completed=',d['completed'],'errors=',d['errors'])
    for r in rows:print(r['scenario'],r['modes']['baseline']['medianMs'],'->',r['modes']['patched']['medianMs'],'ms')
    for r in output['compatibility']:print(r['mode'],'compatibility:',r['outcomes'])
