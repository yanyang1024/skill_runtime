#!/usr/bin/env python3
"""Compare supplied old/new results for an explicit frozen task plan. Does not run agents."""
import argparse
from collections import Counter
from pathlib import Path
import json
from common import digest, read_jsonl, write_json, write_jsonl, write_text


def index(rows):
    result={}
    for r in rows:
        key=(r['task_id'],r['trial'])
        if key in result:raise ValueError('duplicate task/trial; no best-of-N selection')
        if r.get('outcome') not in {'pass','fail','unknown','not_applicable'}:raise ValueError('invalid outcome')
        result[key]=r
    return result


def compare(plan,old,new,out):
    old,new=index(old),index(new)
    tasks=plan['tasks'];trials=plan.get('trials',1)
    if trials<1 or not tasks or len({t['task_id'] for t in tasks})!=len(tasks):raise ValueError('invalid planned tasks')
    planned={(t['task_id'],i) for t in tasks for i in range(trials)}
    if set(old)-planned or set(new)-planned:raise ValueError('unplanned task/trial; freeze plan before comparison')
    pairs=[];counts=Counter();version_issues=Counter();missing=Counter()
    same_fields=('model','environment_hash','grader_version','budget_hash')
    for task in tasks:
        for trial in range(trials):
            key=(task['task_id'],trial);a,b=old.get(key),new.get(key);reason=[]
            for arm,row in (('old',a),('new',b)):
                if row is None:missing[arm]+=1;reason.append(arm+':missing');continue
                if row.get('input_hash')!=task['input_hash']:reason.append(arm+':input_changed')
                if row.get('requested_harness')!=plan[arm+'_harness']:reason.append(arm+':wrong_requested_version')
                if row.get('loaded_harness')!=plan[arm+'_harness']:
                    version_issues[arm]+=1;reason.append(arm+':version_not_confirmed_applied')
                for field in same_fields:
                    if not row.get(field) or row[field]!=plan[field]:reason.append(arm+':'+field+'_mismatch')
            if reason:status='not_comparable'
            elif a['outcome']=='fail' and b['outcome']=='pass':status='improved'
            elif a['outcome']=='pass' and b['outcome']=='fail':status='regressed'
            elif a['outcome']==b['outcome']=='pass':status='both_pass'
            elif a['outcome']==b['outcome']=='fail':status='both_fail'
            else:status='unresolved'  # Unknown/N/A never become a pass or a quality tie.
            counts[status]+=1
            pairs.append({'task_id':key[0],'trial':trial,'source_group':task.get('source_group'),
                'status':status,'reason':reason,'old_outcome':a.get('outcome') if a else None,'new_outcome':b.get('outcome') if b else None})

    def arm_summary(rows):
        summary={'observed_results':len(rows),'planned_trials':len(planned),
                 'outcomes':dict(Counter(r['outcome'] for r in rows.values()))}
        for field in ('input_tokens','output_tokens','latency_s'):
            known=[r[field] for r in rows.values() if type(r.get(field)) in (int,float) and r[field]>=0]
            summary[field]={'sum_observed':sum(known) if known else None,'known_results':len(known),'planned_results':len(planned)}
        return summary

    resource_pairs=[p for p in pairs if p['status']=='both_pass']
    resources={}
    for field in ('input_tokens','output_tokens','latency_s'):
        values=[]
        for pair in resource_pairs:
            key=(pair['task_id'],pair['trial']);av,bv=old[key].get(field),new[key].get(field)
            if all(type(v) in (int,float) and v>=0 for v in (av,bv)):values.append((av,bv))
        resources[field]={'both_pass_known_pairs':len(values),'old_sum':sum(a for a,b in values) if values else None,
            'new_sum':sum(b for a,b in values) if values else None,'scope':'both_pass_pairs_only; inspect all-arm totals too'}
    # Triage only: thresholds and release authorization remain in the user's existing process.
    disposition='review_regressions' if counts['regressed'] else 'needs_more_evidence' if counts['not_comparable'] or counts['unresolved'] else 'ready_for_decision'
    report={'change_id':plan['change_id'],'fixture_only':plan.get('fixture_only',False),'plan_hash':digest(plan),
        'old_results_hash':digest(list(old.values())),'new_results_hash':digest(list(new.values())),
        'planned_trials':len(planned),'paired_status':dict(counts),'missing_results':dict(missing),
        'unconfirmed_applied_versions':dict(version_issues),'old':arm_summary(old),'new':arm_summary(new),
        'resources_on_both_pass':resources,'disposition':disposition,
        'meaning':'Diagnostic summary only; ready_for_decision is not proof of improvement or permission to publish.'}
    out=Path(out);out.mkdir(parents=True,exist_ok=False)
    write_json(out/'comparison.json',report);write_jsonl(out/'paired_results.jsonl',pairs)
    lines=['# Harness 旧/新版本对照','', '虚构数据演示，不代表实际改进。' if report['fixture_only'] else '按冻结计划读取运行结果，未执行任务。','',
        f"变更：{plan['change_id']}；计划 {len(planned)} 次；复核方向：{disposition}。",'',
        '| 同题结果 | 次数 |','|---|---|']
    lines += [f'| {k} | {counts[k]} |' for k in ('improved','regressed','both_pass','both_fail','unresolved','not_comparable')]
    lines += ['', '资源统计包括失败/未知记录的已知消耗；缺失值不填零。双方通过子集仅用于辅助比较，不能代替整体质量。', '',
        '版本未确认生效、输入/模型/环境/验收器/预算不一致的题保留并标为不可比；不剔除后宣布提升。', '',
        'comparison.json 保留完整分母与资源覆盖；paired_results.jsonl 列出具体退步与缺失。没有自动合入或写入 active 记忆。']
    write_text(out/'comparison.md','\n'.join(lines)+'\n')
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--plan',required=True)
    p.add_argument('--old',required=True);p.add_argument('--new',required=True);p.add_argument('--out',required=True)
    a=p.parse_args();plan=json.loads(Path(a.plan).read_text(encoding='utf-8'))
    print(compare(plan,read_jsonl(a.old),read_jsonl(a.new),a.out)['disposition'])


if __name__=='__main__':main()
