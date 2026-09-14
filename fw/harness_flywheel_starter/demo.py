#!/usr/bin/env python3
"""One offline smoke demo. All sessions, model results and checks are fictional fixtures."""
import argparse
import json
from pathlib import Path
from common import digest, timestamp, write_json, write_jsonl
from collect_signals import extract, normalize
from compare_change import compare


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('out');a=p.parse_args()
    out=Path(a.out);out.mkdir(parents=True,exist_ok=False)
    base={'name':'date_query','tool_id':'date_query','tool_version':'v1','usage_phase':'production','phase_source':'manifest',
        'tool_origin':'custom','origin_source':'registry','run_id':'run-1','branch_id':'main','issue_id':'date-1',
        'input_revision':'input-1','args':{'date':'2026/08/01'},'status':'error','error_kind':'invalid_date',
        'capability':{'kind':'skill','id':'date-helper','version':'v1'}}
    tool=[{**base,'event_id':'t'+str(i),'ts':f'2026-08-02T09:0{i}:00Z'} for i in range(3)]
    tool.append({**base,'event_id':'t3','ts':'2026-08-02T09:03:00Z','args':{'date':'2026-08-01'},'status':'success','error_kind':None})
    sessions=[{'tenant_id':'DEMO','session_id':'a','dept':'示例工艺','user_id':'demo-a','source_group':'family-a',
        'messages':[{'role':'user','text':'虚构：按给定日期查询数据。'}],'tool_events':tool,
        'coverage':{'tool_events_complete':True,'capability_events_complete':True},
        'artifact_events':[{'event_id':'w1','op':'write','artifact_id':'asset-a','version':'v1','success':True,'ts':'2026-08-02T09:04:00Z'}],
        'capability_events':[{'event_id':'c1','event_source':'runtime','kind':'skill','capability_id':'date-helper','version':'v1',
            'action':'load','success':True,'ts':'2026-08-02T09:00:00Z'}]},
        {'tenant_id':'DEMO','session_id':'b','dept':'示例研发','user_id':'demo-b','source_group':'family-b',
        'messages':[{'role':'user','text':'虚构：测试自定义工具的非法输入。'}],
        'tool_events':[{**base,'event_id':'test1','usage_phase':'development','run_id':'test-run','issue_id':'negative',
            'ts':'2026-08-03T09:00:00Z','expected_error':True,'expectation_source':'test_definition','assertion_passed':True}],
        'artifact_events':[{'event_id':'u1','op':'upload','success':True,'artifact_id':'copy-a','version':'v1',
            'source_artifact_id':'asset-a','source_version':'v1','lineage_source':'runtime','ts':'2026-08-03T09:00:00Z'}]},
        {'tenant_id':'DEMO','session_id':'c','dept':'示例研发','user_id':'demo-c','source_group':'family-c',
        'tool_events':[{**base,'event_id':'test2','usage_phase':'acceptance','run_id':'acceptance-run','issue_id':'check',
            'status':'success','error_kind':None,'ts':'2026-08-04T09:00:00Z','expectation_source':'test_definition','assertion_passed':False}]}]
    catalog=[{'tenant_id':'DEMO','kind':'skill','capability_id':'date-helper','version':'v1','provider_org':'示例研发',
        'visible_to_orgs':['示例工艺','示例研发'],'visibility_source':'registry','published_at':'2026-07-01T00:00:00Z'}]
    write_jsonl(out/'sessions.jsonl',sessions);write_jsonl(out/'catalog.jsonl',catalog)
    signals=extract(normalize(sessions),catalog,timestamp('2026-08-01T00:00:00Z'),timestamp('2026-09-01T00:00:00Z'),out/'signals')
    assert any(s['name']=='same_args_error_repeated' for s in signals)
    assert not any(s['name']=='tool_problem' and s['scope']['phase']=='development' for s in signals)
    assert any(s['name']=='tool_problem' and s['scope']['phase']=='acceptance' for s in signals)

    plan={'change_id':'DEMO-date-example','fixture_only':True,'old_harness':'h1','new_harness':'h2','trials':1,
        'model':'DEMO-FIXED-MODEL','environment_hash':digest('frozen_environment'),
        'grader_version':'date-check-v1','budget_hash':digest({'max_tokens':2000}),
        'tasks':[{'task_id':'q'+str(i),'input_hash':digest(['input',i]),'source_group':'eval-family-'+str(i)} for i in range(4)]}
    old=[];new=[]
    for i,t in enumerate(plan['tasks']):
        row={k:plan[k] for k in ('model','environment_hash','grader_version','budget_hash')}
        row.update(task_id=t['task_id'],trial=0,input_hash=t['input_hash'],input_tokens=100,output_tokens=30,latency_s=2)
        old.append({**row,'requested_harness':'h1','loaded_harness':'h1','outcome':'fail' if i==0 else 'pass'})
        if i<3:new.append({**row,'requested_harness':'h2','loaded_harness':'h2','outcome':'fail' if i==1 else 'pass',
            'input_tokens':90,'latency_s':1.5})
    write_json(out/'eval_plan.json',plan);write_jsonl(out/'old_results.jsonl',old);write_jsonl(out/'new_results.jsonl',new)
    result=compare(plan,old,new,out/'comparison')
    assert result['paired_status']['regressed']==1 and result['paired_status']['not_comparable']==1
    record=json.loads(Path(__file__).with_name('change_record.example.json').read_text(encoding='utf-8'))
    record.update(change_id=plan['change_id'],signal_ids=[s['signal_id'] for s in signals if s['name']=='same_args_error_repeated'],
        state='evaluated',eval_result_ref='comparison/comparison.json',decision='do_not_activate',
        decision_reason='虚构示例：有一条退步且一条新版本结果缺失，先复核',applied_version=None)
    write_json(out/'change_record.json',record)
    print('Fictional offline demo complete:',out)


if __name__=='__main__':main()
