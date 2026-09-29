import { useEffect, useState } from "react";
import styles from "./OfflineNotice.module.css";

/** Says so when the network drops, since the archives' answers are then the last ones kept. */
export const OfflineNotice = () => {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const goOffline = (): void => setOffline(true);
    const goOnline = (): void => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return offline ? (
    <p className={styles["offline"]} role="status">
      <span aria-hidden="true" />
      OFFLINE · SHOWING THE LAST ARCHIVE ANSWERS KEPT ON THIS DEVICE
    </p>
  ) : null;
};
