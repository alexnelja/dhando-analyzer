#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerWatchlistCommands } from './commands/watchlist.js';
import { registerScreenCommand } from './commands/screen.js';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerPortfolioCommands } from './commands/portfolio.js';
import { registerFinancialsCommands } from './commands/financials.js';
import { registerRulesCommands } from './commands/rules.js';
import { registerDistressCommands } from './commands/distress.js';

const program = new Command();

program
  .name('dhando')
  .description('Dhando Analyzer — systematic value investing CLI')
  .version('0.1.0');

registerInitCommand(program);
registerWatchlistCommands(program);
registerScreenCommand(program);
registerAnalyzeCommand(program);
registerPortfolioCommands(program);
registerFinancialsCommands(program);
registerRulesCommands(program);
registerDistressCommands(program);

program.parse();
