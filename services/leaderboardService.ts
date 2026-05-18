import { db } from '@/services/firebase';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';

export type LeaderboardEntry = {
  id: string;
  teamName: string;
  activityName: string;
  activityId: string;
  score: number;
  createdAt: any;
};

export const getLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  try {
    const q = query(
      collection(db, 'results'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      teamName: doc.data().teamName ?? 'Unknown Team',
      activityName: doc.data().activityName ?? 'Unknown Activity',
      activityId: doc.data().activityId ?? '',
      score: doc.data().score ?? 0,
      createdAt: doc.data().createdAt,
    }));
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
};