import { useEffect, useState } from 'react';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Firebase auth listener will go here in the auth feature branch
  useEffect(() => {
    setLoading(false);
  }, []);

  return { user, loading };
}