#!/usr/bin/env python3
"""Read-only cursor collector and audit reference. Adapt config to your actual API.

HTTP 200, complete pagination and complete session details are separate facts.
Prefer retaining your existing internal collector and reuse collect_user's audit.
No network call occurs without the explicit CLI invocation and URL configuration.
"""
import argparse
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path
from common import digest, read_jsonl, write_json, write_jsonl


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("redirect rejected; configure the final URL")


def field(obj, path):
    if path in {None, ""}: return obj
    for key in path.split("."):
        if not isinstance(obj,dict) or key not in obj: raise ValueError("missing configured response field: "+path)
        obj=obj[key]
    return obj


def fetch_json(url):
    headers={"Accept":"application/json"}
    token=os.environ.get("PLATFORM_API_TOKEN")
    if token:headers["Authorization"]="Bearer "+token
    with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url,headers=headers),timeout=30) as response:
        return response.status,json.load(response)


def collect_user(user, cfg, fetch=fetch_json):
    base=cfg["url"];parsed=urllib.parse.urlparse(base)
    if parsed.scheme not in {"http","https"} or not parsed.netloc or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError("url must be the final API path without query or credentials")
    user_id=user["user_id"]
    audit={"tenant_id":user["tenant_id"],"user_id":user_id,"scope":cfg.get("scope","configured_query"),
        "filters":cfg.get("filters",{}),"http_200_pages":0,"schema_valid_pages":0,
        "pagination_ended":False,"query_complete":False,"history_complete_claim":False,
        "total_expected":None,"unique_sessions":0,"duplicate_items":0,"missing_detail_items":0,"error_type":None}
    audit["owner_validation_items"]=0
    audit["owner_check_configured"]=bool(cfg.get("owner_path"))
    records,pages,seen,seen_cursors={},[],set(),set()
    cursor=None;total=None
    try:
        for page in range(cfg.get("max_pages",1000)):
            params={**cfg.get("filters",{}),cfg.get("user_param","user"):user_id}
            if cursor is not None:params[cfg["cursor_param"]]=cursor
            status,payload=fetch(base+"?"+urllib.parse.urlencode(params))
            if status!=200:raise ValueError("non-200 response")
            audit["http_200_pages"]+=1
            pages.append(payload)
            items=field(payload,cfg.get("items_path","items"))
            if not isinstance(items,list) or not all(isinstance(r,dict) for r in items):raise ValueError("items must be objects")
            audit["schema_valid_pages"]+=1
            if cfg.get("total_path"):
                current=field(payload,cfg["total_path"])
                if type(current) is not int or current<0:raise ValueError("total must be a nonnegative integer")
                if total is not None and current!=total:raise ValueError("total changed during traversal; retry on a stable snapshot")
                total=current;audit["total_expected"]=total
            for r in items:
                sid=field(r,cfg.get("id_path","id"))
                if not isinstance(sid,str) or not sid:raise ValueError("session id must be nonempty text")
                if cfg.get("owner_path"):
                    if field(r,cfg["owner_path"])!=user_id:raise ValueError("response owner differs from requested user")
                    audit["owner_validation_items"]+=1
                if sid in seen:
                    audit["duplicate_items"]+=1
                    if digest(records[sid])!=digest(r):raise ValueError("conflicting duplicate session; unstable snapshot")
                records[sid]=r;seen.add(sid)
            # A null/empty cursor is terminal ONLY if the configured internal contract says so.
            if not cfg.get("next_cursor_path"):
                audit["termination_note"]="No pagination contract: one page collected, completeness unverified"
                break
            nxt=field(payload,cfg["next_cursor_path"])
            if nxt is None or nxt=="":
                audit["pagination_ended"]=True
                break
            if not isinstance(nxt,(str,int)) or isinstance(nxt,bool):raise ValueError("invalid next cursor")
            if str(nxt) in seen_cursors:raise ValueError("repeated pagination cursor")
            seen_cursors.add(str(nxt));cursor=nxt
        else:
            raise ValueError("max_pages reached before terminal cursor")
    except Exception as exc:
        audit["error_type"]=type(exc).__name__  # No response body, URL tokens or credentials in audit.
    audit["unique_sessions"]=len(records)
    requirements=cfg.get("detail_required_fields",["messages"])
    for r in records.values():
        try:
            for key in requirements:field(r,key)
        except ValueError:audit["missing_detail_items"]+=1
    audit["total_matches"]=len(records)==total if total is not None else None
    audit["query_complete"]=not audit["error_type"] and audit["pagination_ended"] and (total is None or len(records)==total)
    audit["detail_fields_present_for_all"]=audit["missing_detail_items"]==0
    audit["note"]="query_complete applies only to configured filters and declared cursor contract; it never proves all history or messages/tools complete"
    exported=[{"tenant_id":user["tenant_id"],"queried_user_id":user_id,"session_id":sid,"raw_session":r} for sid,r in records.items()]
    return exported,audit,pages


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--users",required=True);p.add_argument("--config",required=True);p.add_argument("--out",required=True)
    a=p.parse_args();cfg=json.loads(Path(a.config).read_text());out=Path(a.out)
    if out.exists():raise ValueError("output exists; use a new snapshot directory")
    users=read_jsonl(a.users)
    if len({(u["tenant_id"],u["user_id"]) for u in users})!=len(users):raise ValueError("duplicate user in input roster")
    out.mkdir(parents=True);audits=[];records=[]
    for u in users:
        rows,audit,pages=collect_user(u,cfg)
        ident=digest([u["tenant_id"],u["user_id"]])[:24]
        write_json(out/"raw_pages"/(ident+".json"),pages)
        write_json(out/"audit_users"/(ident+".json"),audit)
        audits.append(audit);records.extend(rows)
    write_jsonl(out/"raw_session_records.jsonl",records)
    write_jsonl(out/"collection_audit.jsonl",audits)
    write_json(out/"manifest.json",{"users_planned":len(users),"users_with_200":sum(x["http_200_pages"]>0 for x in audits),
        "users_query_complete":sum(x["query_complete"] for x in audits),"config_sha256":digest(cfg),
        "note":"Normalize raw_session with your tested OpenCode adapter before value_loop ingest. Index entries are not session details."})
    print(out/"collection_audit.jsonl")


if __name__=="__main__":main()
