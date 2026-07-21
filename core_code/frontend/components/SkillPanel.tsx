import { useRef, useState } from "react";
import type { SkillDetail, SkillSummary } from "../types";

interface Props {
  skills: SkillSummary[];
  onUpload: (file: File) => void;
  onDelete: (name: string) => void;
  getDetail: (name: string) => Promise<SkillDetail>;
}

function formatTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleString("zh-CN", { hour12: false });
}

/** Skill 面板：上传 ZIP + 列表 + 点击展开详情（SKILL.md 与文件列表） */
export default function SkillPanel({ skills, onUpload, onDelete, getDetail }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 竞态防护：快速切换展开项时，落地前校验响应未过期
  const requestNameRef = useRef<string | null>(null);

  const toggle = async (name: string) => {
    if (expanded === name) {
      setExpanded(null);
      setDetail(null);
      requestNameRef.current = null;
      return;
    }
    setExpanded(name);
    setDetail(null);
    setDetailLoading(true);
    requestNameRef.current = name;
    try {
      const d = await getDetail(name);
      if (requestNameRef.current === name) setDetail(d);
    } catch {
      if (requestNameRef.current === name) setDetail(null);
    } finally {
      if (requestNameRef.current === name) setDetailLoading(false);
    }
  };

  return (
    <div className="skill-panel">
      <button className="btn" onClick={() => inputRef.current?.click()}>
        上传 Skill ZIP
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />

      {skills.length === 0 ? (
        <div className="panel-empty">暂无 Skill</div>
      ) : (
        <ul className="skill-list">
          {skills.map((s) => (
            <li key={s.name} className="skill-item">
              <div className="skill-head" onClick={() => toggle(s.name)}>
                <span className="skill-name">{s.name}</span>
                <span className="skill-toggle">{expanded === s.name ? "▾" : "▸"}</span>
              </div>
              {s.description && <div className="skill-desc">{s.description}</div>}
              <div className="skill-meta">
                {s.source ? `${s.source} · ` : ""}
                {formatTime(s.updated_at)}
              </div>

              {expanded === s.name && (
                <div className="skill-detail">
                  {detailLoading && <div className="panel-empty">加载中…</div>}
                  {!detailLoading && detail && detail.name === s.name && (
                    <>
                      {detail.skill_md && <pre className="skill-md">{detail.skill_md}</pre>}
                      {detail.files && detail.files.length > 0 && (
                        <ul className="skill-files">
                          {detail.files.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {!detailLoading && !detail && <div className="panel-empty">详情加载失败</div>}
                </div>
              )}

              <div className="skill-actions">
                <button className="btn-link danger" onClick={() => onDelete(s.name)}>
                  归档
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
