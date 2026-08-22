import React, { useState, useEffect } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Cada filial recebe uma cor própria e fixa, aplicada em todos os formulários.
// O reconhecimento é por nome (case-insensitive), com fallback violeta.
const BRANCH_PALETTES = [
  { test: /mucaj[ái]i/i, color: "emerald" },
  { test: /santar[ée]m/i, color: "sky" },
  { test: /sertanejo/i, color: "amber" },
];

const DEFAULT_COLOR = "violet";

function colorFor(name) {
  const match = BRANCH_PALETTES.find(p => p.test.test(name || ""));
  return match ? match.color : DEFAULT_COLOR;
}

// Lê a filial ativa do mesmo lugar que o Layout (localStorage).
function useActiveBranch() {
  const [name, setName] = useState(() => localStorage.getItem("selectedCompanyName") || "");

  useEffect(() => {
    const sync = () => setName(localStorage.getItem("selectedCompanyName") || "");
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("branch-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("branch-changed", sync);
    };
  }, []);

  return name;
}

export default function BranchBadge({ className, label = "Lançando em" }) {
  const name = useActiveBranch();
  if (!name) return null;

  const color = colorFor(name);

  const palette = {
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  }[color];

  const dot = {
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500",
  }[color];

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold w-fit",
      palette,
      className
    )}>
      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", dot)} />
      <Building2 className="w-4 h-4 flex-shrink-0" />
      <span className="opacity-80 font-medium">{label}:</span>
      <span className="truncate">{name}</span>
    </div>
  );
}