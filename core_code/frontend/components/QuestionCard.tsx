import { useState } from "react";
import type { PendingQuestion, QuestionItem } from "../types";

interface Props {
  request: PendingQuestion;
  onReply: (answers: string[][]) => void;
  onReject: () => void;
}

/**
 * OpenCode 提问卡片。
 * 有 questions 字段时按问题逐个渲染（选项点击可快速填入）；
 * 没有时只提供一个自由文本输入。answers 格式：[["文本"], ...]（每个问题一组）。
 */
export default function QuestionCard({ request, onReply, onReject }: Props) {
  const items: (QuestionItem | null)[] =
    request.questions && request.questions.length > 0 ? request.questions : [null];
  const [answers, setAnswers] = useState<string[]>(() => items.map(() => ""));

  const setAnswer = (index: number, value: string) => {
    setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)));
  };

  const submit = () => {
    onReply(items.map((_, i) => [answers[i] ?? ""]));
  };

  return (
    <div className="card question-card">
      <div className="card-title">OpenCode 提问</div>
      {items.map((q, i) => (
        <div key={i} className="question-item">
          {q?.header && <div className="question-header">{q.header}</div>}
          <div className="question-text">{q?.question ?? "请输入回答："}</div>
          {q?.options && q.options.length > 0 && (
            <div className="question-options">
              {q.options.map((opt, j) => (
                <button
                  key={j}
                  className="chip"
                  title={opt.description}
                  onClick={() => setAnswer(i, opt.label ?? "")}
                >
                  {opt.label ?? "选项"}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            className="question-input"
            value={answers[i]}
            placeholder="输入回答，或点击上方选项"
            onChange={(e) => setAnswer(i, e.target.value)}
          />
        </div>
      ))}
      <div className="card-actions">
        <button className="btn btn-primary" onClick={submit}>
          提交回答
        </button>
        <button className="btn" onClick={onReject}>
          拒绝
        </button>
      </div>
    </div>
  );
}
