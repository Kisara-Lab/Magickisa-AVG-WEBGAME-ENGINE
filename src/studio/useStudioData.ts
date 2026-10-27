import { useEffect, useState } from "react";
import { studioRequest } from "./ProjectManager";
import {
  emptyStudioData,
  studioDataSchema,
  type StudioData,
} from "./investigationModel";
export function useStudioData(scope: string) {
  const [data, setData] = useState(emptyStudioData),
    [revision, setRevision] = useState(""),
    [saved, setSaved] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [past, setPast] = useState<StudioData[]>([]),
    [future, setFuture] = useState<StudioData[]>([]);
  async function reload() {
    try {
      const result = await studioRequest("modern", "studio-data");
      const parsed = studioDataSchema.parse(result.data);
      setData(parsed);
      setSaved(JSON.stringify(parsed));
      setRevision(result.revision);
      setPast([]);
      setFuture([]);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    let active = true;
    setRevision("");
    setData(emptyStudioData());
    setSaved(JSON.stringify(emptyStudioData()));
    setPast([]);
    setFuture([]);
    if (scope)
      void studioRequest("modern", "studio-data")
        .then((result) => {
          if (active) {
            const parsed = studioDataSchema.parse(result.data);
            setData(parsed);
            setSaved(JSON.stringify(parsed));
            setRevision(result.revision);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [scope]);
  function change(next: StudioData) {
    setPast((p) => [...p.slice(-39), data]);
    setFuture([]);
    setData(next);
  }
  async function save() {
    setBusy(true);
    try {
      const result = await studioRequest("modern", "studio-data", {
        data,
        revision,
      });
      setSaved(JSON.stringify(result.data));
      setRevision(result.revision);
      setError("");
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return {
    data,
    change,
    save,
    reload,
    error,
    busy,
    ready: !!revision,
    dirty: JSON.stringify(data) !== saved,
    undo: () => {
      const last = past.at(-1);
      if (last) {
        setFuture((f) => [data, ...f]);
        setData(last);
        setPast((p) => p.slice(0, -1));
      }
    },
    redo: () => {
      const next = future[0];
      if (next) {
        setPast((p) => [...p, data]);
        setData(next);
        setFuture((f) => f.slice(1));
      }
    },
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
export type StudioDataController = ReturnType<typeof useStudioData>;
