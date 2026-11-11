import { useEffect, useState } from "react";
import axios from "axios";

// Live paper account pushed by Meridian (empty until the first sync arrives).
export const useAccount = () => {
  const [acc, setAcc] = useState({});
  useEffect(() => {
    const load = () =>
      axios
        .get("http://localhost:3002/account")
        .then((r) => setAcc(r.data || {}))
        .catch(() => {});
    load();
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, []);
  return acc;
};

export const inr = (n) =>
  n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const kfmt = (n) => {
  if (n == null || isNaN(n)) return "—";
  const a = Math.abs(n);
  const s = a >= 1e7 ? (a / 1e7).toFixed(2) + "Cr" : a >= 1e5 ? (a / 1e5).toFixed(2) + "L" : a >= 1e3 ? (a / 1e3).toFixed(2) + "k" : a.toFixed(2);
  return (n < 0 ? "-" : "") + s;
};
