// Small CLI used by the Docker image. Currently only supports
// `event-qa hash-password` — prompts for a password and prints the
// argon2id hash to paste into event.yaml.
import { createInterface } from 'node:readline';
import argon2 from 'argon2';

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function hashPassword(): Promise<void> {
  const a = await prompt('Password: ');
  const b = await prompt('Confirm: ');
  if (a !== b) {
    process.stderr.write('passwords do not match\n');
    process.exit(2);
  }
  const hash = await argon2.hash(a, { type: argon2.argon2id });
  process.stdout.write(hash + '\n');
}

const sub = process.argv[2];
switch (sub) {
  case 'hash-password':
    void hashPassword();
    break;
  default:
    process.stderr.write('usage: event-qa hash-password\n');
    process.exit(1);
}
