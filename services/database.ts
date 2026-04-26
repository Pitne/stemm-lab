import { ActivityId, ActivityResult, Team } from '@/types';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'stemmlab.db';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDB(): Promise<void> {
  if (db) return;

  db = await SQLite.openDatabaseAsync(DB_NAME);

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      members TEXT NOT NULL,
      grade INTEGER NOT NULL,
      discriminator TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      activity_id TEXT NOT NULL,
      score REAL NOT NULL,
      data TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_results_activity ON results(activity_id);
    CREATE INDEX IF NOT EXISTS idx_results_team ON results(team_id);
  `);
}

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database not initialised. Call initDB() first.');
  }
  return db;
}

interface TeamRow {
  id: number;
  name: string;
  members: string;
  grade: number;
  discriminator: string;
  created_at: number;
}

interface ResultRow {
  id: number;
  team_id: number;
  activity_id: string;
  score: number;
  data: string | null;
  timestamp: number;
}

function rowToTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    members: JSON.parse(row.members),
    grade: row.grade,
    discriminator: row.discriminator,
    created_at: row.created_at,
  };
}

function rowToResult(row: ResultRow): ActivityResult {
  return {
    id: row.id,
    team_id: row.team_id,
    activity_id: row.activity_id as ActivityId,
    score: row.score,
    data: row.data ? JSON.parse(row.data) : undefined,
    timestamp: row.timestamp,
  };
}

export async function saveTeam(
  team: Omit<Team, 'id' | 'created_at'>
): Promise<number> {
  const result = await getDb().runAsync(
    'INSERT INTO teams (name, members, grade, discriminator, created_at) VALUES (?, ?, ?, ?, ?)',
    [
      team.name,
      JSON.stringify(team.members),
      team.grade,
      team.discriminator,
      Date.now(),
    ]
  );
  return result.lastInsertRowId;
}


export async function getTeam(): Promise<Team | null> {
  const row = await getDb().getFirstAsync<TeamRow>(
    'SELECT * FROM teams ORDER BY created_at DESC LIMIT 1'
  );
  return row ? rowToTeam(row) : null;
}

export async function getTeamById(id: number): Promise<Team | null> {
  const row = await getDb().getFirstAsync<TeamRow>(
    'SELECT * FROM teams WHERE id = ?',
    [id]
  );
  return row ? rowToTeam(row) : null;
}

export async function updateTeam(
  id: number,
  team: Partial<Omit<Team, 'id' | 'created_at'>>
): Promise<void> {
  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (team.name !== undefined) {
    fields.push('name = ?');
    values.push(team.name);
  }
  if (team.members !== undefined) {
    fields.push('members = ?');
    values.push(JSON.stringify(team.members));
  }
  if (team.grade !== undefined) {
    fields.push('grade = ?');
    values.push(team.grade);
  }
  if (team.discriminator !== undefined) {
    fields.push('discriminator = ?');
    values.push(team.discriminator);
  }
  if (fields.length === 0) return;

  values.push(id);
  await getDb().runAsync(
    `UPDATE teams SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

export async function isDiscriminatorTaken(
  discriminator: string
): Promise<boolean> {
  const row = await getDb().getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM teams WHERE discriminator = ?',
    [discriminator]
  );
  return (row?.count ?? 0) > 0;
}

export async function saveResult(
  result: Omit<ActivityResult, 'id' | 'timestamp'>
): Promise<number> {
  const r = await getDb().runAsync(
    'INSERT INTO results (team_id, activity_id, score, data, timestamp) VALUES (?, ?, ?, ?, ?)',
    [
      result.team_id,
      result.activity_id,
      result.score,
      result.data ? JSON.stringify(result.data) : null,
      Date.now(),
    ]
  );
  return r.lastInsertRowId;
}

export async function getResults(
  activityId: ActivityId,
  teamId?: number
): Promise<ActivityResult[]> {
  const rows =
    teamId !== undefined
      ? await getDb().getAllAsync<ResultRow>(
          'SELECT * FROM results WHERE activity_id = ? AND team_id = ? ORDER BY timestamp DESC',
          [activityId, teamId]
        )
      : await getDb().getAllAsync<ResultRow>(
          'SELECT * FROM results WHERE activity_id = ? ORDER BY timestamp DESC',
          [activityId]
        );
  return rows.map(rowToResult);
}

/**
 * Returns the best (highest) score for a team on a given activity, or null.
 */
export async function getBestResult(
  activityId: ActivityId,
  teamId: number
): Promise<ActivityResult | null> {
  const row = await getDb().getFirstAsync<ResultRow>(
    'SELECT * FROM results WHERE activity_id = ? AND team_id = ? ORDER BY score DESC LIMIT 1',
    [activityId, teamId]
  );
  return row ? rowToResult(row) : null;
}


export async function clearDatabase(): Promise<void> {
  await getDb().execAsync('DELETE FROM results; DELETE FROM teams;');
}
