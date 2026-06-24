import { useCallback, useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';

// Lightweight OS-permission status for the settings card. `refresh` re-reads
// after a request / return from Settings.
export function usePushPermission(): { status: string; canAskAgain: boolean; refresh: () => void } {
  const [status, setStatus] = useState('undetermined');
  const [canAskAgain, setCanAskAgain] = useState(true);

  const refresh = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then((p) => {
        setStatus(p.status);
        setCanAskAgain(p.canAskAgain);
      })
      .catch(() => {});
  }, []);

  useEffect(() => refresh(), [refresh]);
  return { status, canAskAgain, refresh };
}
