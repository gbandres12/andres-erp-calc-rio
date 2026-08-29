import { useEffect, useState } from "react";

export default function useSelectedCompanyId() {
  const [selectedCompanyId, setSelectedCompanyId] = useState(
    () => localStorage.getItem("selectedCompanyId")
  );

  useEffect(() => {
    const sync = () => setSelectedCompanyId(localStorage.getItem("selectedCompanyId"));
    const onStorage = (e) => {
      if (!e.key || e.key === "selectedCompanyId") sync();
    };
    window.addEventListener("branch-changed", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("branch-changed", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return selectedCompanyId;
}
