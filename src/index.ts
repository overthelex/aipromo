#!/usr/bin/env node

import { createCli } from "./cli/cli.js";

const program = createCli();
program.parse();
