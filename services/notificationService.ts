import * as Notifications from 'expo-notifications';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Request permission from user
export const requestNotificationPermission = async (): Promise<boolean> => {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permission denied');
    return false;
  }

  return true;
};

// Schedule a timed challenge notification
export const scheduleChallengeNotification = async (
  activityName: string,
  minutesUntilExpiry: number
): Promise<string | null> => {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return null;

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Challenge Timer!',
        body: `You have ${minutesUntilExpiry} minutes to complete the ${activityName} challenge!`,
        sound: true,
        data: { activityName },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: minutesUntilExpiry * 60,
        repeats: false,
      },
    });

    console.log('Scheduled notification:', identifier);
    return identifier;
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return null;
  }
};

// Send immediate notification when results are saved
export const sendResultsSavedNotification = async (
  activityName: string,
  teamName: string
): Promise<void> => {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✅ Results Saved!',
        body: `${teamName} successfully saved results for ${activityName}`,
        sound: true,
        data: { activityName, teamName },
      },
      trigger: null, // null = send immediately
    });
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

// Cancel a scheduled notification
export const cancelNotification = async (identifier: string): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    console.log('Cancelled notification:', identifier);
  } catch (error) {
    console.error('Error cancelling notification:', error);
  }
};

// Cancel all scheduled notifications
export const cancelAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('All notifications cancelled');
  } catch (error) {
    console.error('Error cancelling all notifications:', error);
  }
};