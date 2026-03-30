#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('dhando')
  .description('Dhando Analyzer — systematic value investing CLI')
  .version('0.1.0');

program.parse();
