import { Command } from 'commander';
import { createDatabase } from '@dhando/core';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Resolve the canonical path for the local Dhando SQLite database.
 * Creates the ~/.dhando directory if it does not already exist.
 *
 * @returns Absolute path to ~/.dhando/data.db
 */
export function getDbPath(): string {
  const dir = join(homedir(), '.dhando');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'data.db');
}

/**
 * Register the `dhando init` command on the given Commander program.
 *
 * Creates the ~/.dhando directory and initialises all 15 application tables
 * inside data.db. Re-running init on an existing database is safe — all
 * CREATE TABLE statements are idempotent.
 *
 * @param program - The root Commander Command instance.
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialise Dhando Analyzer database at ~/.dhando/data.db')
    .action(() => {
      const dbPath = getDbPath();
      const db = createDatabase(dbPath);
      db.close();
      console.log(`Database initialised at ${dbPath}`);
    });
}
