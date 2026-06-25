import { useState } from "react";
import type { PendingQuestion } from "../types/chat";

interface QuestionCardProps {
  question: PendingQuestion;
  onReply: (questionId: string, answer: unknown) => void;
}

export function QuestionCard({ question, onReply }: QuestionCardProps) {
  const [textAnswer, setTextAnswer] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    question.kind === "text" ? textAnswer.trim().length > 0 : selected.length > 0;

  const handleReply = () => {
    if (!canSubmit) return;
    setSubmitting(true);
    if (question.kind === "multiple") {
      onReply(question.questionId, selected);
    } else if (question.kind === "choice" || question.kind === "confirm") {
      onReply(question.questionId, selected[0] ?? "");
    } else {
      onReply(question.questionId, textAnswer);
    }
  };

  return (
    <div className="question-card">
      <div className="question-title">❓ {question.content}</div>
      {question.options && (
        <div className="question-options">
          {question.options.map((opt) => (
            <label key={opt.id} className="question-option">
              <input
                type={question.kind === "multiple" ? "checkbox" : "radio"}
                name={`question-${question.questionId}`}
                value={opt.id}
                checked={selected.includes(opt.id)}
                onChange={(e) => {
                  if (question.kind === "multiple") {
                    setSelected((prev) =>
                      e.target.checked ? [...prev, opt.id] : prev.filter((id) => id !== opt.id),
                    );
                  } else {
                    setSelected([opt.id]);
                  }
                }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
      {(!question.options || question.kind === "text") && (
        <textarea
          className="question-text"
          rows={3}
          value={textAnswer}
          onChange={(e) => setTextAnswer(e.target.value)}
          placeholder="输入自定义回答..."
          disabled={submitting}
        />
      )}
      <button className="question-submit" onClick={handleReply} disabled={!canSubmit || submitting}>
        {submitting ? "发送中…" : "回复"}
      </button>
    </div>
  );
}
