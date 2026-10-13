import { AlertCircle, CheckCircle2, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/field/cn";
import type { ClosureCheck, ClosureEvaluation } from "@/types/field-workflow";

type OpenTarget = (target: "inventory" | "provisioning") => void;

/** "Before closing" card: what still blocks closure, each with a shortcut to fix it. */
export default function CompletionChecklist({ closure, onOpen }: { closure: ClosureEvaluation; onOpen: OpenTarget }) {
  const blocking = closure.checks.filter((check) => !check.ok && check.severity === "block").length;
  return (
    <div className="rounded-lg bg-white p-4 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Before closing</h2>
        <span
          className={cn(
            "rounded-full px-2 py-[3px] text-xs font-bold",
            blocking ? "bg-warning-bg text-warning" : "bg-success-bg text-success",
          )}
        >
          {blocking ? `${blocking} step${blocking === 1 ? "" : "s"} left` : "Ready to close"}
        </span>
      </div>
      {closure.checks.map((check, index) => (
        <CheckRow key={check.key} check={check} first={index === 0} onOpen={onOpen} />
      ))}
      {!closure.enforced && blocking ? (
        <p className="caption mt-1">Not enforced yet: you can still close, but please complete these.</p>
      ) : null}
    </div>
  );
}

function CheckRow({ check, first, onOpen }: { check: ClosureCheck; first: boolean; onOpen: OpenTarget }) {
  const Icon = check.ok ? CheckCircle2 : check.severity === "warn" ? AlertCircle : Circle;
  const color = check.ok ? "text-success" : check.severity === "warn" ? "text-warning" : "text-error";
  const target = check.action;
  const body = (
    <div className={cn("flex items-center gap-3 py-3 text-left", !first && "border-t border-borderlight")}>
      <Icon className={cn("h-[22px] w-[22px] shrink-0", color)} />
      <div className="flex-1">
        <p className={cn("text-sm font-semibold", check.ok ? "text-gray2" : "text-ink")}>{check.label}</p>
        {check.message ? <p className="mt-0.5 text-xs leading-[17px] text-gray2">{check.message}</p> : null}
      </div>
      {target ? (
        <span className="flex items-center gap-0.5 text-[13px] font-bold text-primary">
          {check.ok ? "View" : "Open"}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </div>
  );
  return target ? (
    <button type="button" className="block w-full" onClick={() => onOpen(target)}>
      {body}
    </button>
  ) : (
    body
  );
}
