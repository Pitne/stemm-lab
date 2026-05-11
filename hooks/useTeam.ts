import { getTeam } from '@/services/database';
import { Team } from '@/types';
import { useCallback, useEffect, useState } from 'react';

/**
 * Loads the most recently created team from SQLite.
 * Call `refresh()` after saving / updating a team to pick up changes.
 */
export function useTeam() {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const t = await getTeam();
      setTeam(t);
    } catch (err) {
      console.error('useTeam load error:', err);
      setTeam(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { team, loading, refresh: load };
}
