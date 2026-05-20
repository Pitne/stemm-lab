import { initDB } from '@/services/database';
import { getLeaderboard } from '@/services/leaderboardService';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_SYNC_TASK = 'background-sync-task';

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    console.log('Background sync task running...');

    const [leaderboardResults] = await Promise.all([
      getLeaderboard(),
      initDB(),
    ]);

    console.log(`Background sync complete — ${leaderboardResults.length} leaderboard entries fetched`);

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background sync failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export const registerBackgroundSync = async (): Promise<void> => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);

    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: 15 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log('Background sync task registered');
    } else {
      console.log('Background sync task already registered');
    }
  } catch (error) {
    console.error('Error registering background task:', error);
  }
};

export const unregisterBackgroundSync = async (): Promise<void> => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
      console.log('Background sync task unregistered');
    }
  } catch (error) {
    console.error('Error unregistering background task:', error);
  }
};

export const getBackgroundSyncStatus = async (): Promise<string> => {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);

    switch (status) {
      case BackgroundFetch.BackgroundFetchStatus.Available:
        return isRegistered ? 'Active' : 'Available but not registered';
      case BackgroundFetch.BackgroundFetchStatus.Denied:
        return 'Denied by user';
      case BackgroundFetch.BackgroundFetchStatus.Restricted:
        return 'Restricted by system';
      default:
        return 'Unknown';
    }
  } catch (error) {
    return 'Error checking status';
  }
};