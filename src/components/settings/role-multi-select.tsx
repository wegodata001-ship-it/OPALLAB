"use client";

import type { UserRole } from "@/lib/types";
import { USER_ROLE_LABELS } from "@/lib/constants/labels";
import { ROLE_PERMISSIONS_SUMMARY } from "@/lib/workflow-permissions";
import { cn } from "@/lib/utils";

const ASSIGNABLE_ROLES: UserRole[] = [
  "SECRETARY",
  "ASSISTANT",
  "DESIGNER",
  "PRINTER",
  "MILLING",
  "PROCESSING",
  "FINISH",
  "PACKAGING",
  "ADMIN",
];

interface RoleMultiSelectProps {
  value: UserRole[];
  onChange: (roles: UserRole[]) => void;
  className?: string;
}

export function RoleMultiSelect({ value, onChange, className }: RoleMultiSelectProps) {
  const toggle = (role: UserRole) => {
    if (value.includes(role)) {
      const next = value.filter((r) => r !== role);
      onChange(next.length ? next : [role]);
    } else {
      onChange([...value, role]);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-slate-500">ניתן לבחור מספר תפקידים לעובד</p>
      <div className="grid grid-cols-2 gap-2">
        {ASSIGNABLE_ROLES.map((role) => (
          <label
            key={role}
            className={cn(
              "flex items-center gap-2 p-2 rounded-lg border text-sm cursor-pointer",
              value.includes(role) ? "border-opal-gold bg-opal-gold/5" : "border-slate-200",
            )}
          >
            <input
              type="checkbox"
              checked={value.includes(role)}
              onChange={() => toggle(role)}
              className="accent-opal-gold"
            />
            <span>{USER_ROLE_LABELS[role]}</span>
          </label>
        ))}
      </div>
      {value.length > 0 && (
        <p className="text-[10px] text-slate-400 leading-snug">
          {value.map((r) => ROLE_PERMISSIONS_SUMMARY[r]).join(" · ")}
        </p>
      )}
    </div>
  );
}
