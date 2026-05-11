export interface Team {
  id?: number;
  name: string;
  members: string[];
  grade: number;
  discriminator: string;
  created_at?: number;
}

export type ActivityId =
  | 'parachute'
  | 'sound'
  | 'handfan'
  | 'earthquake'
  | 'performance'
  | 'reaction'
  | 'breathing';

export interface ActivityResult {
  id?: number;
  team_id: number;
  activity_id: ActivityId;
  score: number;
  data?: Record<string, unknown>;
  timestamp?: number;
}
