import type { PendingQuestion } from "../types/chat";
interface QuestionCardProps {
    question: PendingQuestion;
    onReply: (questionId: string, answer: unknown) => void;
}
export declare function QuestionCard({ question, onReply }: QuestionCardProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=QuestionCard.d.ts.map