import { useRef, useState } from "react";
import type { FileEntry } from "../types";

interface Props {
  files: FileEntry[];
  onUpload: (file: File) => Promise<void>;
  onDelete: (path: string) => void;
  onRefresh: () => void;
  downloadUrl: (path: string) => string;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleString("zh-CN", { hour12: false });
}

/** 文件面板：按钮/拖拽上传 + 按路径平铺排序的列表 */
export default function FilePanel({ files, onUpload, onDelete, onRefresh, downloadUrl }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  const doUpload = async (f: File) => {
    setUploading(true);
    try {
      await onUpload(f);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={dragOver ? "file-panel drag-over" : "file-panel"}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && !uploading) void doUpload(f);
      }}
    >
      <div className="file-toolbar">
        <button className="btn" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "上传中…" : "上传文件"}
        </button>
        <button className="btn" onClick={onRefresh} disabled={uploading}>
          刷新
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doUpload(f);
          e.target.value = "";
        }}
      />

      <div className="drop-hint">{dragOver ? "松开以上传文件" : "可将文件拖到此处上传"}</div>

      {sorted.length === 0 ? (
        <div className="panel-empty">暂无文件</div>
      ) : (
        <ul className="file-list">
          {sorted.map((f) => (
            <li key={f.path} className="file-item">
              <div className="file-info">
                <span className="file-path" title={f.path}>
                  {f.is_dir ? "📁 " : ""}
                  {f.path}
                </span>
                <span className="file-meta">
                  {f.is_dir ? "目录" : formatBytes(f.size)}
                  {formatTime(f.modified_at) ? ` · ${formatTime(f.modified_at)}` : ""}
                </span>
              </div>
              <div className="file-actions">
                {!f.is_dir && (
                  <a className="btn-link" href={downloadUrl(f.path)} download>
                    下载
                  </a>
                )}
                <button className="btn-link danger" onClick={() => onDelete(f.path)}>
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
