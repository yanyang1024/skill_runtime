import type { PendingPermission } from "../types/chat";
interface PermissionCardProps {
    permission: PendingPermission;
    onReply: (requestId: string, allowed: boolean) => void;
}
export declare function PermissionCard({ permission, onReply }: PermissionCardProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=PermissionCard.d.ts.map