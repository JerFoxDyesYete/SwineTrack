import { useEffect, useState } from "react";
import { listSnapshots, SnapshotRow, testSnapshotsConnection } from "./api";

export function useSnapshots(deviceId: string) {
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [connectionTested, setConnectionTested] = useState(false);

  const loadSnapshots = async (pageNum: number = 0) => {
    try {
      setLoading(true);

      if (!connectionTested) {
        console.log("Testing database connection...");
        const connectionOk = await testSnapshotsConnection(deviceId);
        setConnectionTested(true);

        if (!connectionOk) {
          setError("Unable to connect to database");
          return;
        }
      }

      console.log("Loading snapshots, page:", pageNum);
      const data = await listSnapshots(deviceId, pageNum, 2000);

      console.log("Loaded", data.length, "snapshots");

      if (data.length === 0) {
        setHasMore(false);
      }

      if (pageNum === 0) {
        setSnapshots(data);
      } else {
        setSnapshots((prev) => [...prev, ...data]);
      }
      setPage(pageNum);
      setError(null);
    } catch (err: any) {
      console.error("Error in loadSnapshots:", err);
      setError(err.message);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (hasMore && !loading) {
      loadSnapshots(page + 1);
    }
  };

  const refresh = () => {
    setHasMore(true);
    loadSnapshots(0);
  };

  useEffect(() => {
    if (deviceId) {
      loadSnapshots(0);
    }
  }, [deviceId]);

  return { snapshots, loading, error, hasMore, loadMore, refresh };
}
